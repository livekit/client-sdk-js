// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type StructuredLogger } from '../../logger';
import { CLIENT_PROTOCOL_GZIP_RPC } from '../../version';
import type RTCEngine from '../RTCEngine';
import type { ByteStreamReader } from '../data-stream/incoming/StreamReader';
import type OutgoingDataStreamManager from '../data-stream/outgoing/OutgoingDataStreamManager';
import type Participant from '../participant/Participant';
import { Future } from '../utils';
import {
  COMPRESS_MIN_BYTES,
  DATA_STREAM_MIN_BYTES,
  MAX_PAYLOAD_BYTES,
  RPC_DATA_STREAM_TOPIC,
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

  private pendingDataStreams = new Map<string, Future<string, Error>>();

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
  ) {
    await this.engine.publishRpcAck(callerIdentity, requestId);

    if (version !== 1) {
      await this.engine.publishRpcResponse(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('UNSUPPORTED_VERSION'),
      );
      return;
    }

    // Resolve the actual payload from compressed or data stream sources
    let resolvedPayload = payload;
    if (compressedPayload && compressedPayload.length > 0) {
      try {
        resolvedPayload = await gzipDecompress(compressedPayload);
      } catch (e) {
        this.log.error('Failed to decompress RPC request payload', e);
        await this.engine.publishRpcResponse(
          callerIdentity,
          requestId,
          null,
          RpcError.builtIn('APPLICATION_ERROR'),
        );
        return;
      }
    } else if (payload === '') {
      // Empty payload with empty compressedPayload means the request payload
      // is arriving via a data stream tagged with lk.rpc_request_id
      try {
        resolvedPayload = await this.waitForDataStream(requestId);
      } catch (e) {
        this.log.error('Failed to receive RPC data stream payload', e);
        await this.engine.publishRpcResponse(
          callerIdentity,
          requestId,
          null,
          RpcError.builtIn('APPLICATION_ERROR'),
        );
        return;
      }
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

      await this.engine.publishRpcResponse(callerIdentity, requestId, null, responseError);
      return;
    }

    // Determine how to send the response based on the caller's client protocol
    const callerClientProtocol = this.getRemoteParticipantClientProtocol(callerIdentity);

    const responseBytes = byteLength(response ?? '');

    if (
      callerClientProtocol >= CLIENT_PROTOCOL_GZIP_RPC &&
      responseBytes >= DATA_STREAM_MIN_BYTES
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

      await this.engine.publishRpcResponse(callerIdentity, requestId, '', null);

      await gzipCompressToWriter(response!, writer);
      await writer.close();
    } else if (
      callerClientProtocol >= CLIENT_PROTOCOL_GZIP_RPC &&
      responseBytes >= COMPRESS_MIN_BYTES
    ) {
      // Medium response: compress inline
      const compressed = await gzipCompress(response!);
      await this.engine.publishRpcResponseCompressed(callerIdentity, requestId, compressed);
    } else if (responseBytes > MAX_PAYLOAD_BYTES) {
      // Legacy client can't handle large payloads
      const responseError = RpcError.builtIn('RESPONSE_PAYLOAD_TOO_LARGE');
      this.log.warn(`RPC Response payload too large for ${method}`);
      await this.engine.publishRpcResponse(callerIdentity, requestId, null, responseError);
    } else {
      // Small response or legacy client: send uncompressed
      await this.engine.publishRpcResponse(callerIdentity, requestId, response, null);
    }
  }

  /**
   * Handle an incoming byte stream containing an RPC request payload.
   * Decompresses the stream and resolves/rejects the pending data stream future.
   */
  async handleIncomingDataStream(reader: ByteStreamReader, rpcId: string) {
    let decompressed: string;
    try {
      decompressed = await gzipDecompressFromReader(reader);
    } catch (e) {
      this.rejectDataStream(rpcId, e instanceof Error ? e : new Error(String(e)));
      return;
    }
    this.resolveDataStream(rpcId, decompressed);
  }

  /**
   * Wait for an RPC request data stream to arrive and return its decompressed payload.
   */
  private waitForDataStream(requestId: string): Promise<string> {
    const existing = this.pendingDataStreams.get(requestId);
    if (existing) {
      return existing.promise;
    }

    const future = new Future<string, Error>();
    this.pendingDataStreams.set(requestId, future);
    return future.promise;
  }

  /**
   * Called by Room's byte stream handler when a data stream tagged with
   * lk.rpc_request_id arrives.
   */
  resolveDataStream(requestId: string, payload: string) {
    const existing = this.pendingDataStreams.get(requestId);
    if (existing) {
      existing.resolve?.(payload);
      this.pendingDataStreams.delete(requestId);
    } else {
      const future = new Future<string, Error>();
      future.resolve?.(payload);
      this.pendingDataStreams.set(requestId, future);
    }
  }

  rejectDataStream(requestId: string, error: Error) {
    const existing = this.pendingDataStreams.get(requestId);
    if (existing) {
      existing.reject?.(error);
      this.pendingDataStreams.delete(requestId);
    }
  }
}
