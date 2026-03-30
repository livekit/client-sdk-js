// SPDX-FileCopyrightText: 2026 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { DataPacket, DataPacket_Kind, RpcAck, RpcResponse } from '@livekit/protocol';
import { type StructuredLogger } from '../../logger';
import { CLIENT_PROTOCOL_GZIP_RPC } from '../../version';
import type RTCEngine from '../RTCEngine';
import type { ByteStreamReader } from '../data-stream/incoming/StreamReader';
import type OutgoingDataStreamManager from '../data-stream/outgoing/OutgoingDataStreamManager';
import type Participant from '../participant/Participant';
import {
  MAX_LEGACY_PAYLOAD_BYTES,
  RPC_DATA_STREAM_TOPIC,
  RPC_REQUEST_ID_ATTR,
  RPC_REQUEST_METHOD_ATTR,
  RPC_REQUEST_RESPONSE_TIMEOUT_MS_ATTR,
  RPC_RESPONSE_ID_ATTR,
  RpcError,
  type RpcInvocationData,
  byteLength,
  gzipCompressToWriter,
  gzipDecompressFromReader,
} from './utils';

/**
 * Manages the server (handler) side of RPC: processing incoming requests,
 * managing registered method handlers, and sending responses.
 * @internal
 */
export default class RpcServerManager {
  private engine: RTCEngine;

  private log: StructuredLogger;

  private outgoingDataStreamManager: OutgoingDataStreamManager;

  private getRemoteParticipantClientProtocol: (identity: Participant['identity']) => number;

  private rpcHandlers: Map<string, (data: RpcInvocationData) => Promise<string>> = new Map();

  constructor(
    engine: RTCEngine,
    log: StructuredLogger,
    outgoingDataStreamManager: OutgoingDataStreamManager,
    getRemoteParticipantClientProtocol: (identity: Participant['identity']) => number,
  ) {
    this.engine = engine;
    this.log = log;
    this.outgoingDataStreamManager = outgoingDataStreamManager;
    this.getRemoteParticipantClientProtocol = getRemoteParticipantClientProtocol;
  }

  setupEngine(engine: RTCEngine) {
    this.engine = engine;
  }

  registerRpcMethod(method: string, handler: (data: RpcInvocationData) => Promise<string>) {
    if (this.rpcHandlers.has(method)) {
      throw Error(
        `RPC handler already registered for method ${method}, unregisterRpcMethod before trying to register again`,
      );
    }
    this.rpcHandlers.set(method, handler);
  }

  unregisterRpcMethod(method: string) {
    this.rpcHandlers.delete(method);
  }

  async handleIncomingRpcRequest(
    callerIdentity: string,
    requestId: string,
    method: string,
    payload: string,
    responseTimeout: number,
    version: number,
    isCallerStillConnected: () => boolean,
  ) {
    await this.publishRpcAck(callerIdentity, requestId);

    if (version !== 1) {
      if (isCallerStillConnected()) {
        await this.publishRpcResponsePacket(
          callerIdentity,
          requestId,
          null,
          RpcError.builtIn('UNSUPPORTED_VERSION'),
        );
      }
      return;
    }

    const handler = this.rpcHandlers.get(method);

    if (!handler) {
      if (isCallerStillConnected()) {
        await this.publishRpcResponsePacket(
          callerIdentity,
          requestId,
          null,
          RpcError.builtIn('UNSUPPORTED_METHOD'),
        );
      }
      return;
    }

    let response: string | null = null;
    try {
      response = await handler({
        requestId,
        callerIdentity,
        payload,
        responseTimeout,
      });
    } catch (error) {
      let responseError;
      if (error instanceof RpcError) {
        responseError = error;
      } else {
        this.log.warn(
          `Uncaught error returned by RPC handler for ${method}. Returning APPLICATION_ERROR instead.`,
          error,
        );
        responseError = RpcError.builtIn('APPLICATION_ERROR');
      }

      if (isCallerStillConnected()) {
        await this.publishRpcResponsePacket(callerIdentity, requestId, null, responseError);
      }
      return;
    }

    if (isCallerStillConnected()) {
      await this.publishRpcResponse(callerIdentity, requestId, response ?? '');
    }
  }

  private async publishRpcAck(destinationIdentity: string, requestId: string) {
    const packet = new DataPacket({
      destinationIdentities: [destinationIdentity],
      kind: DataPacket_Kind.RELIABLE,
      value: {
        case: 'rpcAck',
        value: new RpcAck({
          requestId,
        }),
      },
    });
    await this.engine.sendDataPacket(packet, DataPacket_Kind.RELIABLE);
  }

  /** @internal */
  private async publishRpcResponsePacket(
    destinationIdentity: string,
    requestId: string,
    payload: string | null,
    error: RpcError | null,
  ) {
    const packet = new DataPacket({
      destinationIdentities: [destinationIdentity],
      kind: DataPacket_Kind.RELIABLE,
      value: {
        case: 'rpcResponse',
        value: new RpcResponse({
          requestId,
          value: error
            ? { case: 'error', value: error.toProto() }
            : { case: 'payload', value: payload ?? '' },
        }),
      },
    });

    await this.engine.sendDataPacket(packet, DataPacket_Kind.RELIABLE);
  }

  /**
   * Send a successful RPC response payload, choosing the transport based on
   * the caller's client protocol version.
   */
  private async publishRpcResponse(
    destinationIdentity: string,
    requestId: string,
    payload: string,
  ) {
    const callerClientProtocol = this.getRemoteParticipantClientProtocol(destinationIdentity);

    if (callerClientProtocol >= CLIENT_PROTOCOL_GZIP_RPC) {
      // Send response as a compressed data stream
      const writer = await this.outgoingDataStreamManager.streamBytes({
        topic: RPC_DATA_STREAM_TOPIC,
        destinationIdentities: [destinationIdentity],
        mimeType: 'application/octet-stream',
        attributes: { [RPC_RESPONSE_ID_ATTR]: requestId },
      });
      await gzipCompressToWriter(payload, writer);
      await writer.close();
      return;
    }

    // Legacy client: enforce size limit and send uncompressed payload inline
    const responseBytes = byteLength(payload);
    if (responseBytes > MAX_LEGACY_PAYLOAD_BYTES) {
      this.log.warn(`RPC Response payload too large for request ${requestId}`);
      await this.publishRpcResponsePacket(
        destinationIdentity,
        requestId,
        null,
        RpcError.builtIn('RESPONSE_PAYLOAD_TOO_LARGE'),
      );
      return;
    }

    await this.publishRpcResponsePacket(destinationIdentity, requestId, payload, null);
  }

  /**
   * Handle an incoming byte stream containing an RPC request payload.
   * Decompresses the stream and resolves/rejects the pending data stream future.
   */
  async handleIncomingDataStream(
    reader: ByteStreamReader,
    callerIdentity: Participant['identity'],
    dataStreamAttrs: Record<string, string>,
  ) {
    const requestId = dataStreamAttrs[RPC_REQUEST_ID_ATTR];
    const method = dataStreamAttrs[RPC_REQUEST_METHOD_ATTR];
    const responseTimeout = parseInt(dataStreamAttrs[RPC_REQUEST_RESPONSE_TIMEOUT_MS_ATTR], 10);

    if (!requestId || !method || Number.isNaN(responseTimeout)) {
      this.log.warn(
        `RPC data stream malformed: ${RPC_REQUEST_ID_ATTR} / ${RPC_REQUEST_METHOD_ATTR} / ${RPC_REQUEST_RESPONSE_TIMEOUT_MS_ATTR} not set.`,
      );
      await this.publishRpcResponsePacket(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('APPLICATION_ERROR'),
      );
    }

    let decompressedPayload: string;
    try {
      decompressedPayload = await gzipDecompressFromReader(reader);
    } catch (e) {
      this.log.warn(`Error decompressing RPC request payload: ${e}`);
      await this.publishRpcResponsePacket(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('APPLICATION_ERROR'),
      );
      return;
    }

    const handler = this.rpcHandlers.get(method);

    if (!handler) {
      await this.publishRpcResponsePacket(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('UNSUPPORTED_METHOD'),
      );
      return;
    }

    let response: string | null = null;
    try {
      response = await handler({
        requestId,
        callerIdentity,
        payload: decompressedPayload,
        responseTimeout,
      });
    } catch (error) {
      let responseError;
      if (error instanceof RpcError) {
        responseError = error;
      } else {
        this.log.warn(
          `Uncaught error returned by RPC handler for ${method}. Returning APPLICATION_ERROR instead.`,
          error,
        );
        responseError = RpcError.builtIn('APPLICATION_ERROR');
      }

      await this.publishRpcResponsePacket(callerIdentity, requestId, null, responseError);
      return;
    }

    await this.publishRpcResponse(callerIdentity, requestId, response ?? '');
  }
}
