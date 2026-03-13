// SPDX-FileCopyrightText: 2026 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {
  DataPacket,
  DataPacket_Kind,
  RpcRequest,
} from '@livekit/protocol';
import { type StructuredLogger } from '../../logger';
import type RTCEngine from '../RTCEngine';
import type OutgoingDataStreamManager from '../data-stream/outgoing/OutgoingDataStreamManager';
import type Participant from '../participant/Participant';
import { Future, compareVersions } from '../utils';
import type { ByteStreamReader } from '../data-stream/incoming/StreamReader';
import {
  DATA_STREAM_MIN_BYTES,
  MAX_LEGACY_PAYLOAD_BYTES,
  type PerformRpcParams,
  RPC_DATA_STREAM_TOPIC,
  RPC_REQUEST_ID_ATTR,
  RPC_REQUEST_METHOD_ATTR,
  RPC_REQUEST_RESPONSE_TIMEOUT_MS_ATTR,
  RpcError,
  byteLength,
  gzipCompress,
  gzipCompressToWriter,
  gzipDecompress,
  gzipDecompressFromReader,
} from './utils';
import { CLIENT_PROTOCOL_GZIP_RPC } from '../../version';
import { EngineEvent } from '../events';

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
    string /* request id */,
    {
      completionFuture: Future<string, RpcError>,
      participantIdentity: string;
    }
  >();

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

    this.engine.on(EngineEvent.DataPacketReceived, this.handleDataPacket);
  }

  async performRpc({
    destinationIdentity,
    method,
    payload,
    responseTimeout: responseTimeoutMs = 15000,
  }: PerformRpcParams): Promise<string> {
    const maxRoundTripLatencyMs = 7000;
    const minEffectiveTimeoutMs = maxRoundTripLatencyMs + 1000;

    const remoteClientProtocol = this.getRemoteParticipantClientProtocol(destinationIdentity);
    const payloadBytes = byteLength(payload);

    // Only enforce the legacy size limit when compression is not available
    if (payloadBytes > MAX_LEGACY_PAYLOAD_BYTES && remoteClientProtocol < 1) {
      throw RpcError.builtIn('REQUEST_PAYLOAD_TOO_LARGE');
    }

    if (
      this.engine.latestJoinResponse?.serverInfo?.version &&
      compareVersions(this.engine.latestJoinResponse?.serverInfo?.version, '1.8.0') < 0
    ) {
      throw RpcError.builtIn('UNSUPPORTED_SERVER');
    }

    const effectiveTimeoutMs = Math.max(responseTimeoutMs, minEffectiveTimeoutMs);
    const id = crypto.randomUUID();

    await this.publishRpcRequest(
      destinationIdentity,
      id,
      method,
      payload,
      effectiveTimeoutMs,
      remoteClientProtocol,
    );

    const completionFuture = new Future<string, RpcError>();

    const ackTimeoutId = setTimeout(() => {
      this.pendingAcks.delete(id);
      completionFuture.reject?.(RpcError.builtIn('CONNECTION_TIMEOUT'));
      this.pendingResponses.delete(id);
      clearTimeout(responseTimeoutId);
    }, maxRoundTripLatencyMs);

    this.pendingAcks.set(id, {
      resolve: () => {
        clearTimeout(ackTimeoutId);
      },
      participantIdentity: destinationIdentity,
    });

    const responseTimeoutId = setTimeout(() => {
      this.pendingResponses.delete(id);
      completionFuture.reject?.(RpcError.builtIn('RESPONSE_TIMEOUT'));
    }, responseTimeoutMs);

    this.pendingResponses.set(id, {
      completionFuture,
      participantIdentity: destinationIdentity,
    });

    return completionFuture.promise.finally(() => {
      clearTimeout(responseTimeoutId);

      if (this.pendingAcks.has(id)) {
        this.log.warn('RPC response received before ack', id);
        this.pendingAcks.delete(id);
        clearTimeout(ackTimeoutId);
      }
    });
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
    if (remoteClientProtocol >= CLIENT_PROTOCOL_GZIP_RPC) {
      mode = 'compressed';
    }
    if (mode === 'compressed' && payloadBytes > DATA_STREAM_MIN_BYTES) {
      mode = 'compressed-data-stream';
    }

    switch (mode) {
      case 'compressed-data-stream': {
        // Large payload: create the data stream tagged with the request ID,
        // send the RPC request with empty payload/compressedPayload, then
        // stream compressed chunks for lower TTFB
        const writer = await this.outgoingDataStreamManager.streamBytes({
          topic: RPC_DATA_STREAM_TOPIC,
          destinationIdentities: [destinationIdentity],
          mimeType: 'application/octet-stream',
          attributes: {
            [RPC_REQUEST_ID_ATTR]: requestId,
            [RPC_REQUEST_METHOD_ATTR]: method,
            [RPC_REQUEST_RESPONSE_TIMEOUT_MS_ATTR]: `${responseTimeout}`,
          },
        });
        await gzipCompressToWriter(payload, writer);
        await writer.close();
        return;
      }

      case 'compressed':
        // Medium payload: compress inline
        const compressedPayload = await gzipCompress(payload);
        await this.sendRpcRequestPacket(
          destinationIdentity,
          requestId,
          method,
          '',
          compressedPayload,
          responseTimeout,
        );
        break;

      case 'regular':
      default:
        // Small payload: just include the payload directly, uncompressed
        await this.sendRpcRequestPacket(
          destinationIdentity,
          requestId,
          method,
          payload,
          undefined,
          responseTimeout,
        );
        break;
    }
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
   * Handle an incoming data packet that may contain an RPC ack or response.
   * Returns true if the packet was handled.
   */
  private handleDataPacket = async (packet: DataPacket): Promise<boolean> => {
    switch (packet.value.case) {
      case 'rpcResponse': {
        const rpcResponse = packet.value.value;

        switch (rpcResponse.value.case) {
          case 'payload': {
            this.handleIncomingRpcResponseSuccess(rpcResponse.requestId, rpcResponse.value.value);
            return true;
          }

          case 'compressedPayload': {
            let payload;
            try {
              payload = await gzipDecompress(rpcResponse.value.value);
            } catch (e) {
              this.log.error('Failed to decompress RPC response', e);
              this.handleIncomingRpcResponseFailure(
                rpcResponse.requestId,
                RpcError.builtIn('APPLICATION_ERROR'),
              );
              return true;
            }
            this.handleIncomingRpcResponseSuccess(rpcResponse.requestId, payload);
            return true;
          }

          case 'error': {
            const error = RpcError.fromProto(rpcResponse.value.value);
            this.handleIncomingRpcResponseFailure(rpcResponse.requestId, error);
            return true;
          }

          default: {
            this.log.warn(`Error handling RPC response data packet: unknown rpcResponse.value.case found (${rpcResponse.value.case})`);
            return false;
          }
        }
      }
      case 'rpcAck': {
        const rpcAck = packet.value.value;

        const handler = this.pendingAcks.get(rpcAck.requestId);
        if (handler) {
          handler.resolve();
          this.pendingAcks.delete(rpcAck.requestId);
        } else {
          this.log.error(`Ack received for unexpected RPC request: ${rpcAck.requestId}`);
        }

        return true;
      }
      default:
        return false;
    }
  };

  /**
   * Handle an incoming byte stream containing an RPC response payload.
   * Decompresses the stream and resolves/rejects the pending data stream future.
   */
  async handleIncomingDataStream(
    reader: ByteStreamReader,
    responseId: string,
  ) {
    let decompressedPayload: string;
    try {
      decompressedPayload = await gzipDecompressFromReader(reader);
    } catch (e) {
      this.log.warn(`Error decompressing RPC response payload: ${e}`);
      this.handleIncomingRpcResponseFailure(responseId, RpcError.builtIn('APPLICATION_ERROR'));
      return;
    }

    this.handleIncomingRpcResponseSuccess(responseId, decompressedPayload);
  }

  private handleIncomingRpcResponseSuccess(requestId: string, payload: string) {
    const handler = this.pendingResponses.get(requestId);
    if (handler) {
      handler.completionFuture.resolve?.(payload);
      this.pendingResponses.delete(requestId);
    } else {
      console.error('Response received for unexpected RPC request', requestId);
    }
  }

  private handleIncomingRpcResponseFailure(requestId: string, error: RpcError) {
    const handler = this.pendingResponses.get(requestId);
    if (handler) {
      handler.completionFuture.reject?.(error);
      this.pendingResponses.delete(requestId);
    } else {
      console.error('Response received for unexpected RPC request', requestId);
    }
  }

  /** @internal */
  handleParticipantDisconnected(participantIdentity: string) {
    for (const [id, { participantIdentity: pendingIdentity }] of this.pendingAcks) {
      if (pendingIdentity === participantIdentity) {
        this.pendingAcks.delete(id);
      }
    }

    for (const [id, { participantIdentity: pendingIdentity, completionFuture }] of this.pendingResponses) {
      if (pendingIdentity === participantIdentity) {
        completionFuture.reject?.(RpcError.builtIn('RECIPIENT_DISCONNECTED'));
        this.pendingResponses.delete(id);
      }
    }
  }
}
