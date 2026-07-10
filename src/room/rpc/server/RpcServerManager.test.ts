import { RpcRequest } from '@livekit/protocol';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../../../logger';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { CLIENT_PROTOCOL_DATA_STREAM_RPC, CLIENT_PROTOCOL_DEFAULT } from '../../../version';
import type RTCEngine from '../../RTCEngine';
import OutgoingDataStreamManager from '../../data-stream/outgoing/OutgoingDataStreamManager';
import { RPC_RESPONSE_DATA_STREAM_TOPIC, RpcError, RpcRequestAttrs } from '../utils';
import RpcServerManager from './RpcServerManager';
import type { RpcServerManagerCallbacks } from './events';

describe('RpcServerManager', () => {
  describe('v1 -> v1', () => {
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

    it('should register a RPC method handler', async () => {
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

  describe('v2 -> v2', () => {
    let rpcServerManager: RpcServerManager;
    let outgoingDataStreamManager: OutgoingDataStreamManager;
    let mockStreamTextWriter: {
      write: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      outgoingDataStreamManager = new OutgoingDataStreamManager({} as unknown as RTCEngine, log);

      mockStreamTextWriter = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.spyOn(outgoingDataStreamManager, 'streamText').mockResolvedValue(
        mockStreamTextWriter as any,
      );

      rpcServerManager = new RpcServerManager(
        log,
        outgoingDataStreamManager,
        (_identity) => CLIENT_PROTOCOL_DATA_STREAM_RPC,
      );
    });

    function makeDataStreamAttrs(requestId: string, method: string, responseTimeout: number) {
      return {
        [RpcRequestAttrs.RPC_REQUEST_ID]: requestId,
        [RpcRequestAttrs.RPC_REQUEST_METHOD]: method,
        [RpcRequestAttrs.RPC_REQUEST_RESPONSE_TIMEOUT_MS]: `${responseTimeout}`,
        [RpcRequestAttrs.RPC_REQUEST_VERSION]: '2',
      };
    }

    function mockTextStreamReader(payload: string) {
      return { readAll: vi.fn().mockResolvedValue(payload) } as any;
    }

    it('should receive a small rpc request (< 15kb) and send a small response via data stream from a participant', async () => {
      const managerEvents = subscribeToEvents<RpcServerManagerCallbacks>(rpcServerManager, [
        'sendDataPacket',
      ]);

      const handler = async () => 'response payload';
      rpcServerManager.registerRpcMethod('test-method', handler);

      const requestId = crypto.randomUUID();
      const responseTimeoutMs = 10_000;
      await rpcServerManager.handleIncomingDataStream(
        mockTextStreamReader('request payload'),
        'caller-identity',
        makeDataStreamAttrs(requestId, 'test-method', responseTimeoutMs),
      );

      // The first event is an acknowledgement of the request
      const ackEvent = await managerEvents.waitFor('sendDataPacket');
      assert(ackEvent.packet.value.case === 'rpcAck');
      expect(ackEvent.packet.value.value.requestId).toStrictEqual(requestId);

      // The response should have been sent via data stream, not packet
      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
      expect(outgoingDataStreamManager.streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: RPC_RESPONSE_DATA_STREAM_TOPIC,
          destinationIdentities: ['caller-identity'],
          attributes: { [RpcRequestAttrs.RPC_REQUEST_ID]: requestId },
        }),
      );
      expect(mockStreamTextWriter.write).toHaveBeenCalledWith('response payload');
      expect(mockStreamTextWriter.close).toHaveBeenCalled();
    });

    it('should receive a large rpc request (> 15kb) and send a large response via data stream from a participant', async () => {
      const managerEvents = subscribeToEvents<RpcServerManagerCallbacks>(rpcServerManager, [
        'sendDataPacket',
      ]);

      const handler = async () => new Array(20_000).fill('B').join('');
      rpcServerManager.registerRpcMethod('test-method', handler);

      const requestId = crypto.randomUUID();
      const responseTimeoutMs = 10_000;
      await rpcServerManager.handleIncomingDataStream(
        mockTextStreamReader(new Array(20_000).fill('A').join('')),
        'caller-identity',
        makeDataStreamAttrs(requestId, 'test-method', responseTimeoutMs),
      );

      // The first event is an acknowledgement of the request
      const ackEvent = await managerEvents.waitFor('sendDataPacket');
      assert(ackEvent.packet.value.case === 'rpcAck');
      expect(ackEvent.packet.value.value.requestId).toStrictEqual(requestId);

      // The response should have been sent via data stream, not packet
      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
      expect(outgoingDataStreamManager.streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: RPC_RESPONSE_DATA_STREAM_TOPIC,
          destinationIdentities: ['caller-identity'],
          attributes: { [RpcRequestAttrs.RPC_REQUEST_ID]: requestId },
        }),
      );
      expect(mockStreamTextWriter.write).toHaveBeenCalledWith(new Array(20_000).fill('B').join(''));
      expect(mockStreamTextWriter.close).toHaveBeenCalled();
    });

    it('should register an RPC method handler', async () => {
      const managerEvents = subscribeToEvents<RpcServerManagerCallbacks>(rpcServerManager, [
        'sendDataPacket',
      ]);

      const methodName = 'testMethod';
      const handler = vi.fn().mockResolvedValue('test response');

      rpcServerManager.registerRpcMethod(methodName, handler);

      await rpcServerManager.handleIncomingDataStream(
        mockTextStreamReader('test payload'),
        'remote-identity',
        makeDataStreamAttrs('test-request-id', methodName, 5000),
      );

      expect(handler).toHaveBeenCalledWith({
        requestId: 'test-request-id',
        callerIdentity: 'remote-identity',
        payload: 'test payload',
        responseTimeout: 5000,
      });

      // Ensure the ack was sent
      const ackEvent = await managerEvents.waitFor('sendDataPacket');
      expect(ackEvent.packet.value.case).toStrictEqual('rpcAck');

      // Response goes via data stream, not packet
      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
      expect(outgoingDataStreamManager.streamText).toHaveBeenCalled();
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

      await rpcServerManager.handleIncomingDataStream(
        mockTextStreamReader('test payload'),
        'remote-identity',
        makeDataStreamAttrs('test-error-request-id', methodName, 5000),
      );

      // Ensure the first event was for the ack
      const ackEvent = await managerEvents.waitFor('sendDataPacket');
      assert(ackEvent.packet.value.case === 'rpcAck');

      // Error responses always go via packet, even for v2 callers
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

      await rpcServerManager.handleIncomingDataStream(
        mockTextStreamReader('test payload'),
        'remote-identity',
        makeDataStreamAttrs('test-rpc-error-request-id', methodName, 5000),
      );

      // Ensure the first event was for the ack
      const ackEvent = await managerEvents.waitFor('sendDataPacket');
      assert(ackEvent.packet.value.case === 'rpcAck');

      // Error responses always go via packet, even for v2 callers
      const errorEvent = await managerEvents.waitFor('sendDataPacket');
      assert(errorEvent.packet.value.case === 'rpcResponse');
      assert(errorEvent.packet.value.value.value.case === 'error');
      const errorResponse = errorEvent.packet.value.value.value.value;
      expect(errorResponse.code).toStrictEqual(errorCode);
      expect(errorResponse.message).toStrictEqual(errorMessage);

      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
    });

    it('should ack and respond with UNSUPPORTED_METHOD for an unregistered method', async () => {
      const managerEvents = subscribeToEvents<RpcServerManagerCallbacks>(rpcServerManager, [
        'sendDataPacket',
      ]);

      // Intentionally do not call registerRpcMethod for "unknown-method".

      const requestId = crypto.randomUUID();
      await rpcServerManager.handleIncomingDataStream(
        mockTextStreamReader('request payload'),
        'caller-identity',
        makeDataStreamAttrs(requestId, 'unknown-method', 5000),
      );

      // Ack must be sent first so the caller knows the handler is alive.
      const ackEvent = await managerEvents.waitFor('sendDataPacket');
      assert(ackEvent.packet.value.case === 'rpcAck');
      expect(ackEvent.packet.value.value.requestId).toStrictEqual(requestId);

      // Then a v1 RpcResponse packet with UNSUPPORTED_METHOD - never a data stream.
      const errorEvent = await managerEvents.waitFor('sendDataPacket');
      assert(errorEvent.packet.value.case === 'rpcResponse');
      assert(errorEvent.packet.value.value.value.case === 'error');
      const errorResponse = errorEvent.packet.value.value.value.value;
      expect(errorResponse.code).toStrictEqual(RpcError.ErrorCode.UNSUPPORTED_METHOD);

      expect(outgoingDataStreamManager.streamText).not.toHaveBeenCalled();
      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
    });
  });

  describe('v1 -> v2', () => {
    it('should use v1 protocol (RpcResponse packet) when responding to a v1 caller', async () => {
      const outgoingDataStreamManager = new OutgoingDataStreamManager(
        {} as unknown as RTCEngine,
        log,
      );
      const streamTextSpy = vi.spyOn(outgoingDataStreamManager, 'streamText');

      const rpcServerManager = new RpcServerManager(
        log,
        outgoingDataStreamManager,
        (_identity) => CLIENT_PROTOCOL_DEFAULT,
      );

      const managerEvents = subscribeToEvents<RpcServerManagerCallbacks>(rpcServerManager, [
        'sendDataPacket',
      ]);

      const handler = async () => 'response payload';
      rpcServerManager.registerRpcMethod('test-method', handler);

      const requestId = crypto.randomUUID();
      await rpcServerManager.handleIncomingRpcRequest(
        'v1-caller',
        new RpcRequest({
          id: requestId,
          method: 'test-method',
          payload: 'request payload',
          responseTimeoutMs: 10_000,
          version: 1,
        }),
      );

      // Ack via packet
      const ackEvent = await managerEvents.waitFor('sendDataPacket');
      assert(ackEvent.packet.value.case === 'rpcAck');

      // Response should be a v1 RpcResponse packet, not a data stream
      expect(streamTextSpy).not.toHaveBeenCalled();
      const responseEvent = await managerEvents.waitFor('sendDataPacket');
      assert(responseEvent.packet.value.case === 'rpcResponse');
      const rpcResponse = responseEvent.packet.value.value;
      expect(rpcResponse.requestId).toStrictEqual(requestId);
      assert(rpcResponse.value.case === 'payload');
      expect(rpcResponse.value.value).toStrictEqual('response payload');

      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);
    });
  });
});
