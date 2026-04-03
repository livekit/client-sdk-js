import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../../../logger';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { CLIENT_PROTOCOL_DATA_STREAM_RPC, CLIENT_PROTOCOL_DEFAULT } from '../../../version';
import type RTCEngine from '../../RTCEngine';
import OutgoingDataStreamManager from '../../data-stream/outgoing/OutgoingDataStreamManager';
import { sleep } from '../../utils';
import {
  RPC_DATA_STREAM_TOPIC,
  RPC_REQUEST_ID_ATTR,
  RPC_REQUEST_METHOD_ATTR,
  RPC_REQUEST_VERSION_ATTR,
  RpcError,
} from '../utils';
import RpcClientManager from './RpcClientManager';
import type { RpcClientManagerCallbacks } from './events';

describe('RpcClientManager', () => {
  describe('v2 -> v1', () => {
    let rpcClientManager: RpcClientManager;

    beforeEach(() => {
      const outgoingDataStreamManager = new OutgoingDataStreamManager(
        {} as unknown as RTCEngine,
        log,
      );

      rpcClientManager = new RpcClientManager(
        log,
        outgoingDataStreamManager,
        (_identity) => CLIENT_PROTOCOL_DEFAULT, // (other participant is "v1")
        () => undefined,
      );
    });

    it('should send v1 RPC request to a "legacy" client and receive successful response', async () => {
      const managerEvents = subscribeToEvents<RpcClientManagerCallbacks>(rpcClientManager, [
        'sendDataPacket',
      ]);

      const [requestId, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'remoteIdentity',
        method: 'testMethod',
        payload: 'testPayload',
      });

      // Verify exactly one packet was emitted
      const { packet } = await managerEvents.waitFor('sendDataPacket');
      assert(packet.value.case === 'rpcRequest');
      expect(packet.value.value.id).toStrictEqual(requestId);
      expect(packet.value.value.method).toStrictEqual('testMethod');
      expect(packet.value.value.payload).toStrictEqual('testPayload');
      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);

      // Asynchronously send a response back
      await sleep(10);
      rpcClientManager.handleIncomingRpcAck(requestId);
      await sleep(10);
      rpcClientManager.handleIncomingRpcResponseSuccess(requestId, 'response payload');

      // Make sure the response came out the other end
      const result = await completionPromise;
      expect(result).toStrictEqual('response payload');
    });

    it('should handle v1 RPC request timeout', async () => {
      vi.useFakeTimers();

      try {
        const method = 'timeoutMethod';
        const payload = 'timeoutPayload';
        const timeout = 50;

        const [, completionPromise] = await rpcClientManager.performRpc({
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

    it('should handle v1 RPC error response', async () => {
      const method = 'errorMethod';
      const payload = 'errorPayload';
      const errorCode = 101;
      const errorMessage = 'Test error message';

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

    it('should handle participant disconnection during v1 RPC request', async () => {
      const method = 'disconnectMethod';
      const payload = 'disconnectPayload';

      const [, completionPromise] = await rpcClientManager.performRpc({
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

  describe('v2 -> v2', () => {
    let rpcClientManager: RpcClientManager;
    let mockStreamTextWriter: {
      write: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
    let mockOutgoingDataStreamManager: OutgoingDataStreamManager;

    beforeEach(() => {
      mockStreamTextWriter = {
        write: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      mockOutgoingDataStreamManager = {
        streamText: vi.fn().mockResolvedValue(mockStreamTextWriter),
      } as unknown as OutgoingDataStreamManager;

      rpcClientManager = new RpcClientManager(
        log,
        mockOutgoingDataStreamManager,
        (_identity) => CLIENT_PROTOCOL_DATA_STREAM_RPC,
        () => undefined,
      );
    });

    it('should send v2 RPC request via data stream and receive successful response', async () => {
      const managerEvents = subscribeToEvents<RpcClientManagerCallbacks>(rpcClientManager, [
        'sendDataPacket',
      ]);

      const [requestId, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'destination-identity',
        method: 'test-method',
        payload: 'request-payload',
      });

      // Verify the data stream was used with correct attributes
      expect(mockOutgoingDataStreamManager.streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: RPC_DATA_STREAM_TOPIC,
          destinationIdentities: ['destination-identity'],
          attributes: expect.objectContaining({
            [RPC_REQUEST_ID_ATTR]: requestId,
            [RPC_REQUEST_METHOD_ATTR]: 'test-method',
            [RPC_REQUEST_VERSION_ATTR]: '2',
          }),
        }),
      );
      expect(mockStreamTextWriter.write).toHaveBeenCalledWith('request-payload');
      expect(mockStreamTextWriter.close).toHaveBeenCalled();

      // No packet should have been emitted
      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);

      rpcClientManager.handleIncomingRpcAck(requestId);
      rpcClientManager.handleIncomingRpcResponseSuccess(requestId, 'response-payload');

      await expect(completionPromise).resolves.toStrictEqual('response-payload');
    });

    it('should send RPC request via data stream with delayed ack and response', async () => {
      const method = 'testMethod';
      const payload = 'testPayload';
      const responsePayload = 'responsePayload';

      const [requestId, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'remote-identity',
        method,
        payload,
      });

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
        const timeout = 50;

        const [, completionPromise] = await rpcClientManager.performRpc({
          destinationIdentity: 'remote-identity',
          method: 'timeoutMethod',
          payload: 'timeoutPayload',
          responseTimeout: timeout,
        });

        const rejectPromise = expect(completionPromise).rejects.toThrow('Response timeout');
        await vi.advanceTimersByTimeAsync(timeout);
        await rejectPromise;
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle RPC error response', async () => {
      const errorCode = 101;
      const errorMessage = 'Test error message';

      const [requestId, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'remote-identity',
        method: 'errorMethod',
        payload: 'errorPayload',
      });

      rpcClientManager.handleIncomingRpcAck(requestId);
      rpcClientManager.handleIncomingRpcResponseFailure(
        requestId,
        new RpcError(errorCode, errorMessage),
      );

      await expect(completionPromise).rejects.toThrow(errorMessage);
    });

    it('should handle participant disconnection during RPC request', async () => {
      const [, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'remote-identity',
        method: 'disconnectMethod',
        payload: 'disconnectPayload',
      });

      await sleep(200);
      rpcClientManager.handleParticipantDisconnected('remote-identity');

      await expect(completionPromise).rejects.toThrow('Recipient disconnected');
    });

    it('should receive response via data stream', async () => {
      const [requestId, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'remote-identity',
        method: 'test-method',
        payload: 'request-payload',
      });

      rpcClientManager.handleIncomingRpcAck(requestId);

      const mockReader = {
        readAll: vi.fn().mockResolvedValue('data-stream-response'),
      };
      await rpcClientManager.handleIncomingDataStream(mockReader as any, requestId);

      await expect(completionPromise).resolves.toStrictEqual('data-stream-response');
    });
  });
});
