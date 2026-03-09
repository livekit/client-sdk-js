// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {
  DataPacket,
  DataPacket_Kind,
  RpcAck,
  RpcRequest,
  RpcResponse,
} from '@livekit/protocol';
import { type StructuredLogger } from '../../logger';
import TypedPromise from '../../utils/TypedPromise';
import type RTCEngine from '../RTCEngine';
import type OutgoingDataStreamManager from '../data-stream/outgoing/OutgoingDataStreamManager';
import type Participant from '../participant/Participant';
import { Future, compareVersions } from '../utils';
import type { ByteStreamReader } from '../data-stream/incoming/StreamReader';
import {
  COMPRESS_MIN_BYTES,
  DATA_STREAM_MIN_BYTES,
  MAX_PAYLOAD_BYTES,
  type PerformRpcParams,
  RPC_DATA_STREAM_TOPIC,
  RPC_REQUEST_ID_ATTR,
  RpcError,
  byteLength,
  gzipCompress,
  gzipCompressToWriter,
  gzipDecompress,
  gzipDecompressFromReader,
} from './utils';

/**
 * Manages the client (caller) side of RPC: sending requests, tracking pending
 * ack/response state, and handling incoming ack/response packets.
 * @internal
 */
export default class RpcClientManager {
  private engine: RTCEngine;

  private log: StructuredLogger;

  private outgoingDataStreamManager: OutgoingDataStreamManager;

  private getRemoteParticipantClientProtocol: (identity: Participant['identity']) => number;

  private pendingAcks = new Map<string, { resolve: () => void; participantIdentity: string }>();

  private pendingResponses = new Map<
    string,
    {
      resolve: (payload: string | null, error: RpcError | null) => void;
      participantIdentity: string;
    }
  >();

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

  performRpc({
    destinationIdentity,
    method,
    payload,
    responseTimeout = 15000,
  }: PerformRpcParams): TypedPromise<string, RpcError> {
    const maxRoundTripLatency = 7000;
    const minEffectiveTimeout = maxRoundTripLatency + 1000;

    return new TypedPromise<string, RpcError>(async (resolve, reject) => {
      const remoteClientProtocol = this.getRemoteParticipantClientProtocol(destinationIdentity);
      const payloadBytes = byteLength(payload);

      // Only enforce the legacy size limit when compression is not available
      if (payloadBytes > MAX_PAYLOAD_BYTES && remoteClientProtocol < 1) {
        reject(RpcError.builtIn('REQUEST_PAYLOAD_TOO_LARGE'));
        return;
      }

      if (
        this.engine.latestJoinResponse?.serverInfo?.version &&
        compareVersions(this.engine.latestJoinResponse?.serverInfo?.version, '1.8.0') < 0
      ) {
        reject(RpcError.builtIn('UNSUPPORTED_SERVER'));
        return;
      }

      const effectiveTimeout = Math.max(responseTimeout, minEffectiveTimeout);
      const id = crypto.randomUUID();

      await this.publishRpcRequest(
        destinationIdentity,
        id,
        method,
        payload,
        effectiveTimeout,
        remoteClientProtocol,
      );

      const ackTimeoutId = setTimeout(() => {
        this.pendingAcks.delete(id);
        reject(RpcError.builtIn('CONNECTION_TIMEOUT'));
        this.pendingResponses.delete(id);
        clearTimeout(responseTimeoutId);
      }, maxRoundTripLatency);

      this.pendingAcks.set(id, {
        resolve: () => {
          clearTimeout(ackTimeoutId);
        },
        participantIdentity: destinationIdentity,
      });

      const responseTimeoutId = setTimeout(() => {
        this.pendingResponses.delete(id);
        reject(RpcError.builtIn('RESPONSE_TIMEOUT'));
      }, responseTimeout);

      this.pendingResponses.set(id, {
        resolve: (responsePayload: string | null, responseError: RpcError | null) => {
          clearTimeout(responseTimeoutId);
          if (this.pendingAcks.has(id)) {
            this.log.warn('RPC response received before ack', id);
            this.pendingAcks.delete(id);
            clearTimeout(ackTimeoutId);
          }

          if (responseError) {
            reject(responseError);
          } else {
            resolve(responsePayload ?? '');
          }
        },
        participantIdentity: destinationIdentity,
      });
    });
  }

  /**
   * Handle an incoming data packet that may contain an RPC ack or response.
   * Returns true if the packet was handled.
   */
  async handleDataPacket(packet: DataPacket): Promise<boolean> {
    switch (packet.value.case) {
      case 'rpcResponse': {
        const rpcResponse = packet.value.value as RpcResponse;
        let payload: string | null = null;
        let error: RpcError | null = null;

        if (rpcResponse.value.case === 'payload') {
          payload = rpcResponse.value.value;
        } else if (rpcResponse.value.case === 'error') {
          error = RpcError.fromProto(rpcResponse.value.value);
        } else if (rpcResponse.value.case === 'compressedPayload') {
          try {
            payload = await gzipDecompress(rpcResponse.value.value);
          } catch (e) {
            this.log.error('Failed to decompress RPC response', e);
            error = RpcError.builtIn('APPLICATION_ERROR');
          }
        }

        // Empty payload with no error means the response payload is arriving
        // via a data stream tagged with lk.rpc_response_id
        if (!error && payload === '') {
          try {
            payload = await this.waitForDataStream(rpcResponse.requestId);
          } catch (e) {
            this.log.error('Failed to receive RPC data stream response', e);
            error = RpcError.builtIn('APPLICATION_ERROR');
            payload = null;
          }
        }

        this.handleIncomingRpcResponse(rpcResponse.requestId, payload, error);
        return true;
      }
      case 'rpcAck': {
        const rpcAck = packet.value.value as RpcAck;
        this.handleIncomingRpcAck(rpcAck.requestId);
        return true;
      }
      default:
        return false;
    }
  }

  handleParticipantDisconnected(participantIdentity: string) {
    for (const [id, { participantIdentity: pendingIdentity }] of this.pendingAcks) {
      if (pendingIdentity === participantIdentity) {
        this.pendingAcks.delete(id);
      }
    }

    for (const [id, { participantIdentity: pendingIdentity, resolve }] of this.pendingResponses) {
      if (pendingIdentity === participantIdentity) {
        resolve(null, RpcError.builtIn('RECIPIENT_DISCONNECTED'));
        this.pendingResponses.delete(id);
      }
    }
  }

  private handleIncomingRpcAck(requestId: string) {
    const handler = this.pendingAcks.get(requestId);
    if (handler) {
      handler.resolve();
      this.pendingAcks.delete(requestId);
    } else {
      console.error('Ack received for unexpected RPC request', requestId);
    }
  }

  private handleIncomingRpcResponse(
    requestId: string,
    payload: string | null,
    error: RpcError | null,
  ) {
    const handler = this.pendingResponses.get(requestId);
    if (handler) {
      handler.resolve(payload, error);
      this.pendingResponses.delete(requestId);
    } else {
      console.error('Response received for unexpected RPC request', requestId);
    }
  }

  private async publishRpcRequest(
    destinationIdentity: string,
    requestId: string,
    method: string,
    payload: string,
    responseTimeout: number,
    remoteClientProtocol: number,
  ) {
    const payloadBytes = byteLength(payload);

    let mode: 'regular' | 'compressed' | 'compressed-data-stream' = 'regular';
    if (remoteClientProtocol >= 1 && payloadBytes >= COMPRESS_MIN_BYTES) {
      mode = 'compressed';
    }
    if (mode === 'compressed' && payloadBytes >= DATA_STREAM_MIN_BYTES) {
      mode = 'compressed-data-stream';
    }

    let requestPayload;
    let requestCompressedPayload;
    switch (mode) {
      case 'compressed-data-stream': {
        // Large payload: create the data stream tagged with the request ID,
        // send the RPC request with empty payload/compressedPayload, then
        // stream compressed chunks for lower TTFB
        const writer = await this.outgoingDataStreamManager.streamBytes({
          topic: RPC_DATA_STREAM_TOPIC,
          destinationIdentities: [destinationIdentity],
          mimeType: 'application/octet-stream',
          attributes: { [RPC_REQUEST_ID_ATTR]: requestId },
        });

        // Send the RPC request now so the receiver knows to expect a data stream
        await this.sendRpcRequestPacket(
          destinationIdentity,
          requestId,
          method,
          '',
          undefined,
          responseTimeout,
        );
        await gzipCompressToWriter(payload, writer);
        await writer.close();
        return;
      }

      case 'compressed':
        // Medium payload: compress inline
        requestCompressedPayload = await gzipCompress(payload);
        requestPayload = '';
        break;

      case 'regular':
      default:
        // Small payload: just include the payload directly, uncompressed
        requestPayload = payload;
        break;
    }

    await this.sendRpcRequestPacket(
      destinationIdentity,
      requestId,
      method,
      requestPayload,
      requestCompressedPayload,
      responseTimeout,
    );
  }

  private async sendRpcRequestPacket(
    destinationIdentity: string,
    requestId: string,
    method: string,
    payload: string | undefined,
    compressedPayload: Uint8Array | undefined,
    responseTimeout: number,
  ) {
    const packet = new DataPacket({
      destinationIdentities: [destinationIdentity],
      kind: DataPacket_Kind.RELIABLE,
      value: {
        case: 'rpcRequest',
        value: new RpcRequest({
          id: requestId,
          method,
          payload: payload ?? '',
          compressedPayload: compressedPayload ?? new Uint8Array(),
          responseTimeoutMs: responseTimeout,
          version: 1,
        }),
      },
    });

    await this.engine.sendDataPacket(packet, DataPacket_Kind.RELIABLE);
  }

  /**
   * Handle an incoming byte stream containing an RPC response payload.
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
   * Wait for an RPC response data stream to arrive and return its decompressed payload.
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
   * lk.rpc_response_id arrives.
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
