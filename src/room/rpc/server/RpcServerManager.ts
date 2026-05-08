import { DataPacket, DataPacket_Kind, RpcAck, RpcRequest, RpcResponse } from '@livekit/protocol';
import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import { type StructuredLogger } from '../../../logger';
import { CLIENT_PROTOCOL_DATA_STREAM_RPC } from '../../../version';
import { type TextStreamReader } from '../../data-stream/incoming/StreamReader';
import type OutgoingDataStreamManager from '../../data-stream/outgoing/OutgoingDataStreamManager';
import type Participant from '../../participant/Participant';
import {
  MAX_V1_PAYLOAD_BYTES,
  RPC_RESPONSE_DATA_STREAM_TOPIC,
  RPC_VERSION_V2,
  RpcError,
  type RpcInvocationData,
  RpcRequestAttrs,
  byteLength,
} from '../utils';
import type { RpcServerManagerCallbacks } from './events';

/**
 * Manages the server (handler) side of RPC: processing incoming requests,
 * managing registered method handlers, and sending responses.
 * @internal
 */
export default class RpcServerManager extends (EventEmitter as new () => TypedEmitter<RpcServerManagerCallbacks>) {
  private log: StructuredLogger;

  private outgoingDataStreamManager: OutgoingDataStreamManager;

  private getRemoteParticipantClientProtocol: (identity: Participant['identity']) => number;

  private rpcHandlers: Map<string, (data: RpcInvocationData) => Promise<string>> = new Map();

  constructor(
    log: StructuredLogger,
    outgoingDataStreamManager: OutgoingDataStreamManager,
    getRemoteParticipantClientProtocol: (identity: Participant['identity']) => number,
  ) {
    super();
    this.log = log;
    this.outgoingDataStreamManager = outgoingDataStreamManager;
    this.getRemoteParticipantClientProtocol = getRemoteParticipantClientProtocol;
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

  /**
   * Handle an incoming RPCRequest message containing a payload.
   * This handles "version 1" of rpc requests.
   * @internal
   */
  async handleIncomingRpcRequest(callerIdentity: string, rpcRequest: RpcRequest) {
    this.publishRpcAck(callerIdentity, rpcRequest.id);

    if (rpcRequest.version !== 1) {
      this.publishRpcResponsePacket(
        callerIdentity,
        rpcRequest.id,
        null,
        RpcError.builtIn('UNSUPPORTED_VERSION'),
      );
      return;
    }

    const handler = this.rpcHandlers.get(rpcRequest.method);

    if (!handler) {
      this.publishRpcResponsePacket(
        callerIdentity,
        rpcRequest.id,
        null,
        RpcError.builtIn('UNSUPPORTED_METHOD'),
      );
      return;
    }

    let response;
    try {
      response = await handler({
        requestId: rpcRequest.id,
        callerIdentity,
        payload: rpcRequest.payload,
        responseTimeout: rpcRequest.responseTimeoutMs,
      });
    } catch (error) {
      let responseError;
      if (error instanceof RpcError) {
        responseError = error;
      } else {
        this.log.warn(
          `Uncaught error returned by RPC handler for ${rpcRequest.method}. Returning APPLICATION_ERROR instead.`,
          error,
        );
        responseError = RpcError.builtIn(
          'APPLICATION_ERROR',
          `Uncaught error: ${(error as Error)?.message ?? error}`,
          { cause: error },
        );
      }

      this.publishRpcResponsePacket(callerIdentity, rpcRequest.id, null, responseError);
      return;
    }

    await this.publishRpcResponse(callerIdentity, rpcRequest.id, response ?? '');
  }

  /**
   * Handle an incoming data stream containing a RPC request payload.
   * This handles "version 2" of rpc requests.
   * @internal
   */
  async handleIncomingDataStream(
    reader: TextStreamReader,
    callerIdentity: Participant['identity'],
    dataStreamAttrs: Record<string, string>,
  ) {
    const requestId = dataStreamAttrs[RpcRequestAttrs.RPC_REQUEST_ID];
    const method = dataStreamAttrs[RpcRequestAttrs.RPC_REQUEST_METHOD];
    const responseTimeout = parseInt(
      dataStreamAttrs[RpcRequestAttrs.RPC_REQUEST_RESPONSE_TIMEOUT_MS],
      10,
    );
    const version = parseInt(dataStreamAttrs[RpcRequestAttrs.RPC_REQUEST_VERSION], 10);

    if (!requestId || !method || Number.isNaN(responseTimeout) || Number.isNaN(version)) {
      this.log.warn(
        `RPC data stream malformed: ${RpcRequestAttrs.RPC_REQUEST_ID} / ${RpcRequestAttrs.RPC_REQUEST_METHOD} / ${RpcRequestAttrs.RPC_REQUEST_RESPONSE_TIMEOUT_MS} / ${RpcRequestAttrs.RPC_REQUEST_VERSION} not set.`,
      );
      this.publishRpcResponsePacket(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('APPLICATION_ERROR', 'RPC data stream malformed'),
      );
      return;
    }

    this.publishRpcAck(callerIdentity, requestId);

    if (version !== RPC_VERSION_V2) {
      this.publishRpcResponsePacket(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('UNSUPPORTED_VERSION'),
      );
      return;
    }

    let payload: string;
    try {
      payload = await reader.readAll();
    } catch (e) {
      this.log.warn(`Error reading RPC request payload: ${e}`);
      this.publishRpcResponsePacket(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('APPLICATION_ERROR', 'Error reading RPC request payload', { cause: e }),
      );
      return;
    }

    const handler = this.rpcHandlers.get(method);

    if (!handler) {
      this.publishRpcResponsePacket(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('UNSUPPORTED_METHOD'),
      );
      return;
    }

    let response;
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

      this.publishRpcResponsePacket(callerIdentity, requestId, null, responseError);
      return;
    }

    await this.publishRpcResponse(callerIdentity, requestId, response ?? '');
  }

  private publishRpcAck(destinationIdentity: string, requestId: string) {
    this.emit('sendDataPacket', {
      packet: new DataPacket({
        destinationIdentities: [destinationIdentity],
        kind: DataPacket_Kind.RELIABLE,
        value: {
          case: 'rpcAck',
          value: new RpcAck({
            requestId,
          }),
        },
      }),
    });
  }

  private publishRpcResponsePacket(
    destinationIdentity: string,
    requestId: string,
    payload: string | null,
    error: RpcError | null,
  ) {
    this.emit('sendDataPacket', {
      packet: new DataPacket({
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
      }),
    });
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

    if (callerClientProtocol >= CLIENT_PROTOCOL_DATA_STREAM_RPC) {
      // Send response as a data stream
      const writer = await this.outgoingDataStreamManager.streamText({
        topic: RPC_RESPONSE_DATA_STREAM_TOPIC,
        destinationIdentities: [destinationIdentity],
        attributes: { [RpcRequestAttrs.RPC_REQUEST_ID]: requestId },
      });
      await writer.write(payload);
      await writer.close();
      return;
    }

    // Legacy client: enforce size limit and send uncompressed payload inline
    const responseBytes = byteLength(payload);
    if (responseBytes > MAX_V1_PAYLOAD_BYTES) {
      this.log.warn(
        `RPC Response payload too large for request ${requestId}. To send larger responses, consider updating the sending client.`,
      );
      this.publishRpcResponsePacket(
        destinationIdentity,
        requestId,
        null,
        RpcError.builtIn('RESPONSE_PAYLOAD_TOO_LARGE'),
      );
      return;
    }

    this.publishRpcResponsePacket(destinationIdentity, requestId, payload, null);
  }
}
