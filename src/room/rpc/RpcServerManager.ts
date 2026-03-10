// SPDX-FileCopyrightText: 2026 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type StructuredLogger } from '../../logger';
import { CLIENT_PROTOCOL_GZIP_RPC } from '../../version';
import type RTCEngine from '../RTCEngine';
import type { ByteStreamReader } from '../data-stream/incoming/StreamReader';
import type OutgoingDataStreamManager from '../data-stream/outgoing/OutgoingDataStreamManager';
import type Participant from '../participant/Participant';
import {
  COMPRESS_MIN_BYTES,
  DATA_STREAM_MIN_BYTES,
  MAX_LEGACY_PAYLOAD_BYTES,
  RPC_DATA_STREAM_TOPIC,
  RPC_REQUEST_ID_ATTR,
  RPC_REQUEST_METHOD_ATTR,
  RPC_REQUEST_RESPONSE_TIMEOUT_MS_ATTR,
  RPC_RESPONSE_ID_ATTR,
  RpcError,
  type RpcInvocationData,
  byteLength,
  gzipCompress,
  gzipCompressToWriter,
  gzipDecompress,
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
    compressedPayload: Uint8Array,
    responseTimeout: number,
    version: number,
    isCallerStillConnected: () => boolean,
  ) {
    await this.engine.publishRpcAck(callerIdentity, requestId);

    if (version !== 1) {
      if (isCallerStillConnected()) {
        await this.engine.publishRpcResponse(
          callerIdentity,
          requestId,
          null,
          RpcError.builtIn('UNSUPPORTED_VERSION'),
        );
      }
      return;
    }

    // Resolve the actual payload from compressed or data stream sources
    let resolvedPayload = payload;
    if (compressedPayload && compressedPayload.length > 0) {
      try {
        resolvedPayload = await gzipDecompress(compressedPayload);
      } catch (e) {
        this.log.error('Failed to decompress RPC request payload', e);
        if (isCallerStillConnected()) {
          await this.engine.publishRpcResponse(
            callerIdentity,
            requestId,
            null,
            RpcError.builtIn('APPLICATION_ERROR'),
          );
        }
        return;
      }
    }

    const handler = this.rpcHandlers.get(method);

    if (!handler) {
      if (isCallerStillConnected()) {
        await this.engine.publishRpcResponse(
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
        payload: resolvedPayload,
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
        await this.engine.publishRpcResponse(callerIdentity, requestId, null, responseError);
      }
      return;
    }

    // Determine how to send the response based on the caller's client protocol
    const callerClientProtocol = this.getRemoteParticipantClientProtocol(callerIdentity);

    const responseBytes = byteLength(response ?? '');

    // Large response: create the data stream tagged with the request ID,
    // send the RPC response with empty payload, then stream compressed chunks
    // for lower TTFB
    if (
      callerClientProtocol >= CLIENT_PROTOCOL_GZIP_RPC &&
      responseBytes > DATA_STREAM_MIN_BYTES
    ) {
      const writer = await this.outgoingDataStreamManager.streamBytes({
        topic: RPC_DATA_STREAM_TOPIC,
        destinationIdentities: [callerIdentity],
        mimeType: 'application/octet-stream',
        attributes: { [RPC_RESPONSE_ID_ATTR]: requestId },
      });

      await gzipCompressToWriter(response, writer);
      await writer.close();
      return;
    }

    // Medium response: compress inline
    if (
      callerClientProtocol >= CLIENT_PROTOCOL_GZIP_RPC &&
      responseBytes > COMPRESS_MIN_BYTES
    ) {
      const compressed = await gzipCompress(response!);
      await this.engine.publishRpcResponseCompressed(callerIdentity, requestId, compressed);
      return;
    }

    // Legacy client can't handle large payloads
    if (responseBytes > MAX_LEGACY_PAYLOAD_BYTES) {
      const responseError = RpcError.builtIn('RESPONSE_PAYLOAD_TOO_LARGE');
      this.log.warn(`RPC Response payload too large for ${method}`);
      if (isCallerStillConnected()) {
        await this.engine.publishRpcResponse(callerIdentity, requestId, null, responseError);
      }
      return;
    }

    // Small response or legacy client: send uncompressed
    if (isCallerStillConnected()) {
      await this.engine.publishRpcResponse(callerIdentity, requestId, response, null);
    }
  }

  /**
   * Handle an incoming byte stream containing an RPC request payload.
   * Decompresses the stream and resolves/rejects the pending data stream future.
   */
  async handleIncomingDataStream(
    reader: ByteStreamReader,
    callerIdentity: Participant["identity"],
    dataStreamAttrs: Record<string, string>
  ) {
    const requestId = dataStreamAttrs[RPC_REQUEST_ID_ATTR];
    const method = dataStreamAttrs[RPC_REQUEST_METHOD_ATTR];
    const responseTimeout = parseInt(dataStreamAttrs[RPC_REQUEST_RESPONSE_TIMEOUT_MS_ATTR], 10);

    if (!requestId || !method || Number.isNaN(responseTimeout)) {
      this.log.warn(`RPC data stream malformed: ${RPC_REQUEST_ID_ATTR} / ${RPC_REQUEST_METHOD_ATTR} / ${RPC_REQUEST_RESPONSE_TIMEOUT_MS_ATTR} not set.`);
      await this.engine.publishRpcResponse(
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
      await this.engine.publishRpcResponse(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('APPLICATION_ERROR'),
      );
      return;
    }

    const handler = this.rpcHandlers.get(method);

    if (!handler) {
      await this.engine.publishRpcResponse(
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

      await this.engine.publishRpcResponse(callerIdentity, requestId, null, responseError);
      return;
    }

    // Determine how to send the response based on the caller's client protocol
    const callerClientProtocol = this.getRemoteParticipantClientProtocol(callerIdentity);

    const responseBytes = byteLength(response ?? '');

    if (
      callerClientProtocol >= CLIENT_PROTOCOL_GZIP_RPC &&
      responseBytes > DATA_STREAM_MIN_BYTES
    ) {
      // Large response: create the data stream tagged with the request ID,
      // send the RPC response with empty payload, then stream compressed chunks
      // for lower TTFB
      const writer = await this.outgoingDataStreamManager.streamBytes({
        topic: RPC_DATA_STREAM_TOPIC,
        destinationIdentities: [callerIdentity],
        mimeType: 'application/octet-stream',
        attributes: { [RPC_RESPONSE_ID_ATTR]: requestId },
      });
      await gzipCompressToWriter(response!, writer);
      await writer.close();
      return;
    }

    if (
      callerClientProtocol >= CLIENT_PROTOCOL_GZIP_RPC &&
      responseBytes > COMPRESS_MIN_BYTES
    ) {
      // Medium response: compress inline
      const compressed = await gzipCompress(response);
      await this.engine.publishRpcResponseCompressed(callerIdentity, requestId, compressed);
      return;
    }

    if (responseBytes > MAX_LEGACY_PAYLOAD_BYTES) {
      // Legacy client can't handle large payloads
      const responseError = RpcError.builtIn('RESPONSE_PAYLOAD_TOO_LARGE');
      this.log.warn(`RPC Response payload too large for ${method}`);
      await this.engine.publishRpcResponse(callerIdentity, requestId, null, responseError);
      return;
    }

    // Small response or legacy client: send uncompressed
    await this.engine.publishRpcResponse(callerIdentity, requestId, response, null);
  }
}
