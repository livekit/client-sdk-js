import { DataPacket_Kind } from '@livekit/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../logger';
import { CLIENT_PROTOCOL_DEFAULT } from '../version';
import type RTCEngine from './RTCEngine';
import OutgoingDataStreamManager from './data-stream/outgoing/OutgoingDataStreamManager';
import { RpcClientManager, RpcError, RpcServerManager } from './rpc';
import { sleep } from './utils';

describe('RpcClientManager', () => {
  let rpcClientManager: RpcClientManager;
  let mockSendDataPacket: ReturnType<typeof vi.fn>;
  let mockEngine: RTCEngine;

  beforeEach(() => {
    mockSendDataPacket = vi.fn();
    mockEngine = {
      client: {
        sendUpdateLocalMetadata: vi.fn(),
      },
      on: vi.fn().mockReturnThis(),
      sendDataPacket: mockSendDataPacket,
    } as unknown as RTCEngine;

    const outgoingDataStreamManager = new OutgoingDataStreamManager(mockEngine, log);
    rpcClientManager = new RpcClientManager(
      mockEngine,
      log,
      outgoingDataStreamManager,
      (_identity) => CLIENT_PROTOCOL_DEFAULT,
    );
  });

  it.skip('should send a rpc message to a participant (legacy path)', async () => {
    mockSendDataPacket.mockImplementationOnce(() => Promise.resolve());

    const [requestId, completionPromise] = await rpcClientManager.performRpc({
      destinationIdentity: 'destination-identity',
      method: 'test-method',
      payload: 'request-payload',
    });

    expect(mockSendDataPacket).toHaveBeenCalledTimes(1);

    // Make sure the request was sent
    const packet = mockSendDataPacket.mock.lastCall![0];
    expect(packet.value.case).toStrictEqual('rpcRequest');
    expect(packet.value.value.id).toStrictEqual(requestId);
    expect(packet.value.value.method).toStrictEqual('test-method');
    expect(packet.value.value.payload).toStrictEqual('request-payload');
    expect(packet.value.value.compressedPayload).toStrictEqual(new Uint8Array());

    rpcClientManager.handleIncomingRpcAck(requestId);

    rpcClientManager.handleIncomingRpcResponseSuccess(requestId, 'response-payload');

    await expect(completionPromise).resolves.toStrictEqual('response-payload');
  });

  it('should send RPC request and receive successful response', async () => {
    const method = 'testMethod';
    const payload = 'testPayload';
    const responsePayload = 'responsePayload';

    mockSendDataPacket.mockImplementationOnce(() => Promise.resolve());

    const [requestId, completionPromise] = await rpcClientManager.performRpc({
      destinationIdentity: 'remote-identity',
      method,
      payload,
    });

    expect(mockSendDataPacket).toHaveBeenCalledTimes(1);

    setTimeout(() => {
      rpcClientManager.handleIncomingRpcAck(requestId);
      setTimeout(() => {
        rpcClientManager.handleIncomingRpcResponseSuccess(requestId, responsePayload);
      }, 10);
    }, 10);

    const result = await completionPromise;
    expect(result).toStrictEqual(responsePayload);
  });

  it('should handle RPC request timeout', async () => {
    vi.useFakeTimers();

    try {
      const method = 'timeoutMethod';
      const payload = 'timeoutPayload';
      const timeout = 50;

      mockSendDataPacket.mockImplementationOnce(() => Promise.resolve());

      const [requestId, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'remote-identity',
        method,
        payload,
        responseTimeout: timeout,
      });

      // Register the rejection handler before advancing so the rejection is caught
      const rejectPromise = expect(completionPromise).rejects.toThrow('Response timeout');

      // Response timeout (50ms) fires before ack timeout (7000ms)
      await vi.advanceTimersByTimeAsync(timeout);

      await rejectPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  it('should handle RPC error response', async () => {
    const method = 'errorMethod';
    const payload = 'errorPayload';
    const errorCode = 101;
    const errorMessage = 'Test error message';

    mockSendDataPacket.mockImplementationOnce(() => Promise.resolve());

    const [requestId, completionPromise] = await rpcClientManager.performRpc({
      destinationIdentity: 'remote-identity',
      method,
      payload,
    });

    rpcClientManager.handleIncomingRpcAck(requestId);
    rpcClientManager.handleIncomingRpcResponseFailure(
      requestId,
      new RpcError(errorCode, errorMessage),
    );

    await expect(completionPromise).rejects.toThrow(errorMessage);
  });

  it('should handle participant disconnection during RPC request', async () => {
    const method = 'disconnectMethod';
    const payload = 'disconnectPayload';

    mockSendDataPacket.mockImplementationOnce(() => Promise.resolve());

    const [requestId, completionPromise] = await rpcClientManager.performRpc({
      destinationIdentity: 'remote-identity',
      method,
      payload,
    });

    // Simulate a small delay before disconnection
    await sleep(200);
    rpcClientManager.handleParticipantDisconnected('remote-identity');

    await expect(completionPromise).rejects.toThrow('Recipient disconnected');
  });
});

describe('RpcServerManager', () => {
  let rpcServerManager: RpcServerManager;
  let mockSendDataPacket: ReturnType<typeof vi.fn>;
  let mockEngine: RTCEngine;

  beforeEach(() => {
    mockSendDataPacket = vi.fn();
    mockEngine = {
      client: {
        sendUpdateLocalMetadata: vi.fn(),
      },
      on: vi.fn().mockReturnThis(),
      sendDataPacket: mockSendDataPacket,
    } as unknown as RTCEngine;

    const outgoingDataStreamManager = new OutgoingDataStreamManager(mockEngine, log);
    rpcServerManager = new RpcServerManager(
      mockEngine,
      log,
      outgoingDataStreamManager,
      (_identity) => CLIENT_PROTOCOL_DEFAULT,
    );

    mockSendDataPacket.mockImplementation(() => Promise.resolve());
  });

  it('should receive a rpc message from a participant', async () => {
    const handler = vi.fn().mockReturnValueOnce('response payload');
    rpcServerManager.registerRpcMethod('test-method', handler);

    const requestId = crypto.randomUUID();
    const responseTimeoutMs = 10_000;
    await rpcServerManager.handleIncomingRpcRequest(
      'caller-identity',
      requestId,
      'test-method',
      'request payload',
      new Uint8Array(),
      responseTimeoutMs,
      1,
      () => true,
    );

    // Make sure two packets were sent:
    expect(mockSendDataPacket).toHaveBeenCalledTimes(2);

    // The first an acknowledgement of the request
    const ackPacket = mockSendDataPacket.mock.calls[0][0];
    expect(ackPacket.value.case).toStrictEqual('rpcAck');
    expect(ackPacket.value.value.requestId).toStrictEqual(requestId);

    // And the second being the actual response
    const rpcResponsePacket = mockSendDataPacket.mock.calls[1][0];
    expect(rpcResponsePacket.value.case).toStrictEqual('rpcResponse');
    expect(rpcResponsePacket.value.value.requestId).toStrictEqual(requestId);
    expect(rpcResponsePacket.value.value.value.case).toStrictEqual('payload');
    expect(rpcResponsePacket.value.value.value.value).toStrictEqual('response payload');
  });

  it('should register an RPC method handler', async () => {
    const methodName = 'testMethod';
    const handler = vi.fn().mockResolvedValue('test response');

    rpcServerManager.registerRpcMethod(methodName, handler);

    await rpcServerManager.handleIncomingRpcRequest(
      'remote-identity',
      'test-request-id',
      methodName,
      'test payload',
      new Uint8Array(),
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

    // Ensure sendDataPacket was called twice (once for the ack and once for response)
    expect(mockSendDataPacket).toHaveBeenCalledTimes(2);

    // Ensure the first call was for the ack
    expect(mockSendDataPacket.mock.calls[0][0].value.case).toStrictEqual('rpcAck');
    expect(mockSendDataPacket.mock.calls[0][1]).toStrictEqual(DataPacket_Kind.RELIABLE);

    // and the second call was for the response
    expect(mockSendDataPacket.mock.calls[1][0].value.case).toStrictEqual('rpcResponse');
    expect(mockSendDataPacket.mock.calls[1][1]).toStrictEqual(DataPacket_Kind.RELIABLE);
  });

  it('should catch and transform unhandled errors in the RPC method handler', async () => {
    const methodName = 'errorMethod';
    const errorMessage = 'Test error';
    const handler = vi.fn().mockRejectedValue(new Error(errorMessage));

    rpcServerManager.registerRpcMethod(methodName, handler);

    await rpcServerManager.handleIncomingRpcRequest(
      'remote-identity',
      'test-error-request-id',
      methodName,
      'test payload',
      new Uint8Array(),
      5000,
      1,
      () => true,
    );

    expect(handler).toHaveBeenCalledWith({
      requestId: 'test-error-request-id',
      callerIdentity: 'remote-identity',
      payload: 'test payload',
      responseTimeout: 5000,
    });

    // Ensure sendDataPacket was called twice (once for ack and once for error response)
    expect(mockSendDataPacket).toHaveBeenCalledTimes(2);

    // Ensure the first call was for the ack
    expect(mockSendDataPacket.mock.calls[0][0].value.case).toStrictEqual('rpcAck');
    expect(mockSendDataPacket.mock.calls[0][1]).toStrictEqual(DataPacket_Kind.RELIABLE);

    // And the second call was for the error response
    const errorResponse = mockSendDataPacket.mock.calls[1][0].value.value.value.value;
    expect(errorResponse.code).toStrictEqual(RpcError.ErrorCode.APPLICATION_ERROR);
  });

  it('should pass through RpcError thrown by the RPC method handler', async () => {
    const methodName = 'rpcErrorMethod';
    const errorCode = 101;
    const errorMessage = 'some-error-message';
    const handler = vi.fn().mockRejectedValue(new RpcError(errorCode, errorMessage));

    rpcServerManager.registerRpcMethod(methodName, handler);

    await rpcServerManager.handleIncomingRpcRequest(
      'remote-identity',
      'test-rpc-error-request-id',
      methodName,
      'test payload',
      new Uint8Array(),
      5000,
      1,
      () => true,
    );

    expect(handler).toHaveBeenCalledWith({
      requestId: 'test-rpc-error-request-id',
      callerIdentity: 'remote-identity',
      payload: 'test payload',
      responseTimeout: 5000,
    });

    // Ensure sendDataPacket was called twice (once for ACK and once for error response)
    expect(mockSendDataPacket).toHaveBeenCalledTimes(2);

    // Ensure the first call was for the ack
    expect(mockSendDataPacket.mock.calls[0][0].value.case).toStrictEqual('rpcAck');
    expect(mockSendDataPacket.mock.calls[0][1]).toStrictEqual(DataPacket_Kind.RELIABLE);

    // And the second call was for the error response
    const errorResponse = mockSendDataPacket.mock.calls[1][0].value.value.value.value;
    expect(errorResponse.code).toStrictEqual(errorCode);
    expect(errorResponse.message).toStrictEqual(errorMessage);
  });
});
