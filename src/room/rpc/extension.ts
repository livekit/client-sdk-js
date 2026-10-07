import {
  type PerformRpcParams,
  RPC_REQUEST_DATA_STREAM_TOPIC,
  RPC_RESPONSE_DATA_STREAM_TOPIC,
  RpcClientManager,
  RpcError,
  type RpcInvocationData,
  RpcServerManager,
} from '.';
import type TypedPromise from '../../utils/TypedPromise';
import { CLIENT_PROTOCOL_DEFAULT } from '../../version';
import type { CoreRoom } from '../CoreRoom';
import { DataChannelKind } from '../data-channel/types';
import { dataStreams } from '../data-stream/extension';
import { RoomEvent } from '../events';
import type { ExtensionContext, ExtensionResult, RoomExtension } from '../extensions';

/** Methods the `rpc` extension adds to the room. */
export interface RpcRoomApi {
  /**
   * Establishes the participant as a receiver for calls of the specified RPC method.
   *
   * @param method - The name of the indicated RPC method
   * @param handler - Will be invoked when an RPC request for this method is received
   * @returns A promise that resolves when the method is successfully registered
   * @throws {Error} If a handler for this method is already registered (must call unregisterRpcMethod first)
   *
   * @example
   * ```typescript
   * room.localParticipant?.registerRpcMethod(
   *   'greet',
   *   async (data: RpcInvocationData) => {
   *     console.log(`Received greeting from ${data.callerIdentity}: ${data.payload}`);
   *     return `Hello, ${data.callerIdentity}!`;
   *   }
   * );
   * ```
   *
   * The handler should return a Promise that resolves to a string.
   * If unable to respond within `responseTimeout`, the request will result in an error on the caller's side.
   *
   * You may throw errors of type `RpcError` with a string `message` in the handler,
   * and they will be received on the caller's side with the message intact.
   * Other errors thrown in your handler will not be transmitted as-is, and will instead arrive to the caller as `1500` ("Application Error").
   */
  registerRpcMethod(method: string, handler: (data: RpcInvocationData) => Promise<string>): void;

  /**
   * Unregisters a previously registered RPC method.
   *
   * @param method - The name of the RPC method to unregister
   */
  unregisterRpcMethod(method: string): void;
}

/** Methods the `rpc` extension adds to the local participant. */
export interface RpcLocalApi {
  /**
   * Initiate an RPC call to a remote participant
   * @param params - Parameters for initiating the RPC call, see {@link PerformRpcParams}
   * @returns A promise that resolves with the response payload or rejects with an error.
   * @throws Error on failure. Details in `message`.
   */
  performRpc(params: PerformRpcParams): TypedPromise<string, RpcError>;

  /**
   * @deprecated use `room.registerRpcMethod` instead
   */
  registerRpcMethod(method: string, handler: (data: RpcInvocationData) => Promise<string>): void;

  /**
   * @deprecated use `room.unregisterRpcMethod` instead
   */
  unregisterRpcMethod(method: string): void;
}

/**
 * RPC over the room (`performRpc`, `registerRpcMethod`). Requires {@link dataStreams}.
 */
export const rpc = {
  key: Symbol('rpc'),
  requires: [dataStreams] as const,
  install(room: CoreRoom, ctx: ExtensionContext): ExtensionResult<RpcRoomApi, RpcLocalApi> {
    const { incoming, outgoing } = ctx.get(dataStreams);
    const clientProtocol = (identity: string) =>
      room.remoteParticipants.get(identity)?.clientProtocol ?? CLIENT_PROTOCOL_DEFAULT;

    const client = new RpcClientManager(
      ctx.log,
      outgoing,
      clientProtocol,
      () => room.engine?.serverVersion,
    );
    client.on('sendDataPacket', ({ packet }) => {
      room.engine?.sendDataPacket(packet, DataChannelKind.RELIABLE);
    });
    const server = new RpcServerManager(ctx.log, outgoing, clientProtocol);
    server.on('sendDataPacket', ({ packet }) => {
      room.engine?.sendDataPacket(packet, DataChannelKind.RELIABLE);
    });

    incoming.registerTextStreamHandler(
      RPC_REQUEST_DATA_STREAM_TOPIC,
      async (reader, { identity }) => {
        await server.handleIncomingDataStream(reader, identity, reader.info.attributes ?? {});
      },
    );
    incoming.registerTextStreamHandler(
      RPC_RESPONSE_DATA_STREAM_TOPIC,
      async (reader, { identity }) => {
        await client.handleIncomingDataStream(reader, identity, reader.info.attributes ?? {});
      },
    );

    ctx.onDataPacket('rpcRequest', (request, packet) => {
      server.handleIncomingRpcRequest(packet.participantIdentity, request);
    });
    ctx.onDataPacket('rpcResponse', (response) => {
      switch (response.value.case) {
        case 'payload':
          client.handleIncomingRpcResponseSuccess(response.requestId, response.value.value);
          break;
        case 'error':
          client.handleIncomingRpcResponseFailure(
            response.requestId,
            RpcError.fromProto(response.value.value),
          );
          break;
        default:
          ctx.log.warn(`Unknown rpcResponse.value.case: ${response.value.case}`);
          break;
      }
    });
    ctx.onDataPacket('rpcAck', (ack) => client.handleIncomingRpcAck(ack.requestId));

    room.on(RoomEvent.ParticipantDisconnected, (participant) =>
      client.handleParticipantDisconnected(participant.identity),
    );

    const registerRpcMethod: RpcRoomApi['registerRpcMethod'] = (method, handler) =>
      server.registerRpcMethod(method, handler);
    const unregisterRpcMethod: RpcRoomApi['unregisterRpcMethod'] = (method) =>
      server.unregisterRpcMethod(method);

    return {
      room: { registerRpcMethod, unregisterRpcMethod },
      local: {
        performRpc: (params) =>
          client.performRpc(params).then(([_id, completionPromise]) => completionPromise),
        registerRpcMethod,
        unregisterRpcMethod,
      },
    };
  },
} satisfies RoomExtension<RpcRoomApi, RpcLocalApi>;
