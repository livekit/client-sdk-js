import { DataPacket, DataPacket_Kind } from '@livekit/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../logger';
import type { InternalRoomOptions } from '../options';
import { CLIENT_PROTOCOL_DEFAULT } from '../version';
import type RTCEngine from './RTCEngine';
import Room from './Room';
import OutgoingDataStreamManager from './data-stream/outgoing/OutgoingDataStreamManager';
import LocalParticipant from './participant/LocalParticipant';
import { ParticipantKind } from './participant/Participant';
import RemoteParticipant from './participant/RemoteParticipant';
import { RpcClientManager, RpcError, RpcServerManager } from './rpc';

describe.skip('LocalParticipant', () => {
  describe('registerRpcMethod', () => {
    let room: Room;
    let rpcClientManager: RpcClientManager;
    let rpcServerManager: RpcServerManager;
    let mockSendDataPacket: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSendDataPacket = vi.fn();

      room = new Room();
      room.engine.client = {
        sendUpdateLocalMetadata: vi.fn(),
      };
      room.engine.on = vi.fn().mockReturnThis();
      room.engine.sendDataPacket = mockSendDataPacket;

      room.localParticipant.sid = 'test-sid';
      room.localParticipant.identity = 'test-identity';

      const mockEngine = {
        client: {
          sendUpdateLocalMetadata: vi.fn(),
        },
        on: vi.fn().mockReturnThis(),
        sendDataPacket: vi.fn(),
        publishRpcAck: vi.fn(),
        publishRpcResponse: vi.fn(),
      } as unknown as RTCEngine;

      const outgoingDataStreamManager = new OutgoingDataStreamManager(mockEngine, log);
      rpcClientManager = new RpcClientManager(
        mockEngine,
        log,
        outgoingDataStreamManager,
        (_identity) => 1,
      );
      rpcServerManager = new RpcServerManager(
        mockEngine,
        log,
        outgoingDataStreamManager,
        (_identity) => 1,
      );
    });

    it('should register an RPC method handler', async () => {
      const methodName = 'testMethod';
      const handler = vi.fn().mockResolvedValue('test response');

      room.registerRpcMethod(methodName, handler);

      const mockCaller = new RemoteParticipant(
        {} as any,
        'remote-sid',
        'remote-identity',
        'Remote Participant',
        '',
        undefined,
        undefined,
        ParticipantKind.STANDARD,
      );

      await rpcServerManager.handleIncomingRpcRequest(
        mockCaller.identity,
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
        callerIdentity: mockCaller.identity,
        payload: 'test payload',
        responseTimeout: 5000,
      });

      // Check if sendDataPacket was called twice (once for ACK and once for response)
      expect(mockSendDataPacket).toHaveBeenCalledTimes(2);

      // Check if the first call was for ACK
      expect(mockSendDataPacket.mock.calls[0][0].value.case).toBe('rpcAck');
      expect(mockSendDataPacket.mock.calls[0][1]).toBe(DataPacket_Kind.RELIABLE);

      // Check if the second call was for response
      expect(mockSendDataPacket.mock.calls[1][0].value.case).toBe('rpcResponse');
      expect(mockSendDataPacket.mock.calls[1][1]).toBe(DataPacket_Kind.RELIABLE);
    });

    it('should catch and transform unhandled errors in the RPC method handler', async () => {
      const methodName = 'errorMethod';
      const errorMessage = 'Test error';
      const handler = vi.fn().mockRejectedValue(new Error(errorMessage));

      room.registerRpcMethod(methodName, handler);

      const mockCaller = new RemoteParticipant(
        {} as any,
        'remote-sid',
        'remote-identity',
        'Remote Participant',
        '',
        undefined,
        undefined,
        ParticipantKind.STANDARD,
      );

      await rpcServerManager.handleIncomingRpcRequest(
        mockCaller.identity,
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
        callerIdentity: mockCaller.identity,
        payload: 'test payload',
        responseTimeout: 5000,
      });

      // Check if sendDataPacket was called twice (once for ACK and once for error response)
      expect(mockSendDataPacket).toHaveBeenCalledTimes(2);

      // Check if the second call was for error response
      const errorResponse = mockSendDataPacket.mock.calls[1][0].value.value.value.value;
      expect(errorResponse.code).toBe(RpcError.ErrorCode.APPLICATION_ERROR);
    });

    it('should pass through RpcError thrown by the RPC method handler', async () => {
      const methodName = 'rpcErrorMethod';
      const errorCode = 101;
      const errorMessage = 'some-error-message';
      const handler = vi.fn().mockRejectedValue(new RpcError(errorCode, errorMessage));

      room.localParticipant.registerRpcMethod(methodName, handler);

      const mockCaller = new RemoteParticipant(
        {} as any,
        'remote-sid',
        'remote-identity',
        'Remote Participant',
        '',
        undefined,
        undefined,
        ParticipantKind.STANDARD,
      );

      await rpcServerManager.handleIncomingRpcRequest(
        mockCaller.identity,
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
        callerIdentity: mockCaller.identity,
        payload: 'test payload',
        responseTimeout: 5000,
      });

      // Check if sendDataPacket was called twice (once for ACK and once for error response)
      expect(mockSendDataPacket).toHaveBeenCalledTimes(2);

      // Check if the second call was for error response
      const errorResponse = mockSendDataPacket.mock.calls[1][0].value.value.value.value;
      expect(errorResponse.code).toBe(errorCode);
      expect(errorResponse.message).toBe(errorMessage);
    });
  });

  describe('performRpc', () => {
    let localParticipant: LocalParticipant;
    let rpcClientManager: RpcClientManager;
    let rpcServerManager: RpcServerManager;
    let mockRemoteParticipant: RemoteParticipant;
    let mockEngine: RTCEngine;
    let mockRoomOptions: InternalRoomOptions;
    let mockSendDataPacket: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockSendDataPacket = vi.fn();
      mockEngine = {
        client: {
          sendUpdateLocalMetadata: vi.fn(),
        },
        on: vi.fn().mockReturnThis(),
        sendDataPacket: mockSendDataPacket,
      } as unknown as RTCEngine;

      mockRoomOptions = {} as InternalRoomOptions;

      const outgoingDataStreamManager = new OutgoingDataStreamManager(mockEngine, log);
      rpcClientManager = new RpcClientManager(
        mockEngine,
        log,
        outgoingDataStreamManager,
        (_identity) => 1,
      );
      rpcServerManager = new RpcServerManager(
        mockEngine,
        log,
        outgoingDataStreamManager,
        (_identity) => 1,
      );

      localParticipant = new LocalParticipant(
        'local-sid',
        'local-identity',
        mockEngine,
        mockRoomOptions,
        outgoingDataStreamManager,
        rpcClientManager,
        rpcServerManager,
      );

      mockRemoteParticipant = new RemoteParticipant(
        {} as any,
        'remote-sid',
        'remote-identity',
        'Remote Participant',
        '',
        undefined,
        undefined,
        ParticipantKind.STANDARD,
      );
    });

    it('should send RPC request and receive successful response', async () => {
      const method = 'testMethod';
      const payload = 'testPayload';
      const responsePayload = 'responsePayload';

      mockSendDataPacket.mockImplementationOnce((packet: DataPacket) => {
        const requestId = (packet.value.value as any).id;
        setTimeout(() => {
          rpcClientManager.handleIncomingRpcAck(requestId);
          setTimeout(() => {
            rpcClientManager.handleIncomingRpcResponseSuccess(requestId, responsePayload);
          }, 10);
        }, 10);
      });

      const result = await localParticipant.performRpc({
        destinationIdentity: mockRemoteParticipant.identity,
        method,
        payload,
      });

      expect(mockSendDataPacket).toHaveBeenCalledTimes(1);
      expect(result).toBe(responsePayload);
    });

    it('should handle RPC request timeout', async () => {
      const method = 'timeoutMethod';
      const payload = 'timeoutPayload';

      const timeout = 50;

      const resultPromise = localParticipant.performRpc({
        destinationIdentity: mockRemoteParticipant.identity,
        method,
        payload,
        responseTimeout: timeout,
      });

      mockSendDataPacket.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          setTimeout(resolve, timeout + 10);
        });
      });

      const startTime = Date.now();

      await expect(resultPromise).rejects.toThrow('Response timeout');

      const elapsedTime = Date.now() - startTime;
      expect(elapsedTime).toBeGreaterThanOrEqual(timeout);
      expect(elapsedTime).toBeLessThan(timeout + 50); // Allow some margin for test execution

      expect(mockSendDataPacket).toHaveBeenCalledTimes(1);
    });

    it('should handle RPC error response', async () => {
      const method = 'errorMethod';
      const payload = 'errorPayload';
      const errorCode = 101;
      const errorMessage = 'Test error message';

      mockSendDataPacket.mockImplementationOnce((packet: DataPacket) => {
        const requestId = (packet.value.value as any).id;
        setTimeout(() => {
          rpcClientManager.handleIncomingRpcAck(requestId);
          rpcClientManager.handleIncomingRpcResponseFailure(
            requestId,
            new RpcError(errorCode, errorMessage),
          );
        }, 10);
      });

      await expect(
        localParticipant.performRpc({
          destinationIdentity: mockRemoteParticipant.identity,
          method,
          payload,
        }),
      ).rejects.toThrow(errorMessage);
    });

    it('should handle participant disconnection during RPC request', async () => {
      const method = 'disconnectMethod';
      const payload = 'disconnectPayload';

      mockSendDataPacket.mockImplementationOnce(() => Promise.resolve());

      const resultPromise = localParticipant.performRpc({
        destinationIdentity: mockRemoteParticipant.identity,
        method,
        payload,
      });

      // Simulate a small delay before disconnection
      await new Promise((resolve) => setTimeout(resolve, 200));
      rpcClientManager.handleParticipantDisconnected(mockRemoteParticipant.identity);

      await expect(resultPromise).rejects.toThrow('Recipient disconnected');
    });
  });
});

describe('RpcClientManager', () => {
  it.skip('should send a rpc message to a participant (legacy path)', async () => {
    const mockSendDataPacket = vi.fn();
    const mockEngine = {
      client: {
        sendUpdateLocalMetadata: vi.fn(),
      },
      on: vi.fn().mockReturnThis(),
      sendDataPacket: mockSendDataPacket,
    } as unknown as RTCEngine;

    const outgoingDataStreamManager = new OutgoingDataStreamManager(mockEngine, log);
    const rpcClientManager = new RpcClientManager(
      mockEngine,
      log,
      outgoingDataStreamManager,
      (_identity) => CLIENT_PROTOCOL_DEFAULT, // NOTE: All other participants are on client protocol 0
    );

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
});

describe('RpcServerManager', () => {
  it('should receive a rpc message from a participant', async () => {
    const mockSendDataPacket = vi.fn();
    const mockEngine = {
      client: {
        sendUpdateLocalMetadata: vi.fn(),
      },
      on: vi.fn().mockReturnThis(),
      sendDataPacket: mockSendDataPacket,
    } as unknown as RTCEngine;

    const outgoingDataStreamManager = new OutgoingDataStreamManager(mockEngine, log);
    const rpcServerManager = new RpcServerManager(
      mockEngine,
      log,
      outgoingDataStreamManager,
      (_identity) => CLIENT_PROTOCOL_DEFAULT, // NOTE: All other participants are on client protocol 0
    );

    mockSendDataPacket
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => Promise.resolve());

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
});
