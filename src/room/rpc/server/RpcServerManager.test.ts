import { DataPacket_Kind } from '@livekit/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../../../logger';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { CLIENT_PROTOCOL_DEFAULT } from '../../../version';
import type RTCEngine from '../../RTCEngine';
import OutgoingDataStreamManager from '../../data-stream/outgoing/OutgoingDataStreamManager';
import { RpcError } from '../utils';
import type { RpcServerManagerCallbacks } from './events';
import RpcServerManager from './RpcServerManager';

describe('RpcServerManager', () => {
  let rpcServerManager: RpcServerManager;

  beforeEach(() => {
    const outgoingDataStreamManager = new OutgoingDataStreamManager(
      {} as unknown as RTCEngine,
      log,
    );

    rpcServerManager = new RpcServerManager(
      log,
      outgoingDataStreamManager,
      (_identity) => CLIENT_PROTOCOL_DEFAULT,
    );
  });

  it('should receive a rpc message from a participant', async () => {
    const managerEvents = subscribeToEvents<RpcServerManagerCallbacks>(rpcServerManager, [
      'sendDataPacket',
    ]);

    const handler = async () => 'response payload';
    rpcServerManager.registerRpcMethod('test-method', handler);

    const requestId = crypto.randomUUID();
    const responseTimeoutMs = 10_000;
    await rpcServerManager.handleIncomingRpcRequest(
      'caller-identity',
      requestId,
      'test-method',
      'request payload',
      responseTimeoutMs,
      1,
      () => true,
    );

    // The first event is an acknowledgement of the request
    const ackEvent = await managerEvents.waitFor('sendDataPacket');
    expect(ackEvent.packet.value.case).toStrictEqual('rpcAck');
    expect(ackEvent.packet.value.value.requestId).toStrictEqual(requestId);

    // And the second being the actual response
    const responseEvent = await managerEvents.waitFor('sendDataPacket');
    expect(responseEvent.packet.value.case).toStrictEqual('rpcResponse');
    expect(responseEvent.packet.value.value.requestId).toStrictEqual(requestId);
    expect(responseEvent.packet.value.value.value.case).toStrictEqual('payload');
    expect(responseEvent.packet.value.value.value.value).toStrictEqual('response payload');

    expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
  });

  it('should register an RPC method handler', async () => {
    const managerEvents = subscribeToEvents<RpcServerManagerCallbacks>(rpcServerManager, [
      'sendDataPacket',
    ]);

    const methodName = 'testMethod';
    const handler = vi.fn().mockResolvedValue('test response');

    rpcServerManager.registerRpcMethod(methodName, handler);

    await rpcServerManager.handleIncomingRpcRequest(
      'remote-identity',
      'test-request-id',
      methodName,
      'test payload',
      5000,
      1,
      () => true,
    );

    expect(handler).toHaveBeenCalledWith({
      requestId: 'test-request-id',
      callerIdentity: 'remote-identity',
      payload: 'test payload',
      responseTimeout: 5000,
    });

    // Ensure the first event was for the ack
    const ackEvent = await managerEvents.waitFor('sendDataPacket');
    expect(ackEvent.packet.value.case).toStrictEqual('rpcAck');
    expect(ackEvent.kind).toStrictEqual(DataPacket_Kind.RELIABLE);

    // And the second event was for the response
    const responseEvent = await managerEvents.waitFor('sendDataPacket');
    expect(responseEvent.packet.value.case).toStrictEqual('rpcResponse');
    expect(responseEvent.kind).toStrictEqual(DataPacket_Kind.RELIABLE);

    expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
  });

  it('should catch and transform unhandled errors in the RPC method handler', async () => {
    const managerEvents = subscribeToEvents<RpcServerManagerCallbacks>(rpcServerManager, [
      'sendDataPacket',
    ]);

    const methodName = 'errorMethod';
    const errorMessage = 'Test error';
    const handler = async () => {
      throw new Error(errorMessage);
    };

    rpcServerManager.registerRpcMethod(methodName, handler);

    await rpcServerManager.handleIncomingRpcRequest(
      'remote-identity',
      'test-error-request-id',
      methodName,
      'test payload',
      5000,
      1,
      () => true,
    );

    // Ensure the first event was for the ack
    const ackEvent = await managerEvents.waitFor('sendDataPacket');
    expect(ackEvent.packet.value.case).toStrictEqual('rpcAck');
    expect(ackEvent.kind).toStrictEqual(DataPacket_Kind.RELIABLE);

    // And the second event was for the error response
    const errorEvent = await managerEvents.waitFor('sendDataPacket');
    const errorResponse = errorEvent.packet.value.value.value.value;
    expect(errorResponse.code).toStrictEqual(RpcError.ErrorCode.APPLICATION_ERROR);

    expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
  });

  it('should pass through RpcError thrown by the RPC method handler', async () => {
    const managerEvents = subscribeToEvents<RpcServerManagerCallbacks>(rpcServerManager, [
      'sendDataPacket',
    ]);

    const methodName = 'rpcErrorMethod';
    const errorCode = 101;
    const errorMessage = 'some-error-message';
    const handler = async () => {
      throw new RpcError(errorCode, errorMessage);
    };

    rpcServerManager.registerRpcMethod(methodName, handler);

    await rpcServerManager.handleIncomingRpcRequest(
      'remote-identity',
      'test-rpc-error-request-id',
      methodName,
      'test payload',
      5000,
      1,
      () => true,
    );

    // Ensure the first event was for the ack
    const ackEvent = await managerEvents.waitFor('sendDataPacket');
    expect(ackEvent.packet.value.case).toStrictEqual('rpcAck');
    expect(ackEvent.kind).toStrictEqual(DataPacket_Kind.RELIABLE);

    // And the second event was for the error response
    const errorEvent = await managerEvents.waitFor('sendDataPacket');
    const errorResponse = errorEvent.packet.value.value.value.value;
    expect(errorResponse.code).toStrictEqual(errorCode);
    expect(errorResponse.message).toStrictEqual(errorMessage);

    expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
  });
});
