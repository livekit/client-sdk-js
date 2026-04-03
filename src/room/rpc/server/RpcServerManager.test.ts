import { RpcRequest } from '@livekit/protocol';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../../../logger';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { CLIENT_PROTOCOL_DEFAULT } from '../../../version';
import type RTCEngine from '../../RTCEngine';
import OutgoingDataStreamManager from '../../data-stream/outgoing/OutgoingDataStreamManager';
import { RpcError } from '../utils';
import RpcServerManager from './RpcServerManager';
import type { RpcServerManagerCallbacks } from './events';

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
      new RpcRequest({
        id: requestId,
        method: 'test-method',
        payload: 'request payload',
        responseTimeoutMs,
        version: 1,
      }),
    );

    // The first event is an acknowledgement of the request
    const ackEvent = await managerEvents.waitFor('sendDataPacket');
    assert(ackEvent.packet.value.case === 'rpcAck');
    expect(ackEvent.packet.value.value.requestId).toStrictEqual(requestId);

    // And the second being the actual response
    const responseEvent = await managerEvents.waitFor('sendDataPacket');
    assert(responseEvent.packet.value.case === 'rpcResponse');
    const rpcResponse = responseEvent.packet.value.value;
    expect(rpcResponse.requestId).toStrictEqual(requestId);
    assert(rpcResponse.value.case === 'payload');
    expect(rpcResponse.value.value).toStrictEqual('response payload');

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
      new RpcRequest({
        id: 'test-request-id',
        method: methodName,
        payload: 'test payload',
        responseTimeoutMs: 5000,
        version: 1,
      }),
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

    // And the second event was for the response
    const responseEvent = await managerEvents.waitFor('sendDataPacket');
    expect(responseEvent.packet.value.case).toStrictEqual('rpcResponse');

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
      new RpcRequest({
        id: 'test-error-request-id',
        method: methodName,
        payload: 'test payload',
        responseTimeoutMs: 5000,
        version: 1,
      }),
    );

    // Ensure the first event was for the ack
    const ackEvent = await managerEvents.waitFor('sendDataPacket');
    assert(ackEvent.packet.value.case === 'rpcAck');

    // And the second event was for the error response
    const errorEvent = await managerEvents.waitFor('sendDataPacket');
    assert(errorEvent.packet.value.case === 'rpcResponse');
    assert(errorEvent.packet.value.value.value.case === 'error');
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
      new RpcRequest({
        id: 'test-rpc-error-request-id',
        method: methodName,
        payload: 'test payload',
        responseTimeoutMs: 5000,
        version: 1,
      }),
    );

    // Ensure the first event was for the ack
    const ackEvent = await managerEvents.waitFor('sendDataPacket');
    assert(ackEvent.packet.value.case === 'rpcAck');

    // And the second event was for the error response
    const errorEvent = await managerEvents.waitFor('sendDataPacket');
    assert(errorEvent.packet.value.case === 'rpcResponse');
    assert(errorEvent.packet.value.value.value.case === 'error');
    const errorResponse = errorEvent.packet.value.value.value.value;
    expect(errorResponse.code).toStrictEqual(errorCode);
    expect(errorResponse.message).toStrictEqual(errorMessage);

    expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
  });
});
