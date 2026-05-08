import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../../../logger';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { CLIENT_PROTOCOL_DATA_STREAM_RPC, CLIENT_PROTOCOL_DEFAULT } from '../../../version';
import type RTCEngine from '../../RTCEngine';
import OutgoingDataStreamManager from '../../data-stream/outgoing/OutgoingDataStreamManager';
import { RPC_REQUEST_DATA_STREAM_TOPIC, RpcError, RpcRequestAttrs } from '../utils';
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

    it('should send v1 RPC request to a "legacy" client (happy path)', async () => {
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
      rpcClientManager.handleIncomingRpcAck(requestId);
      rpcClientManager.handleIncomingRpcResponseSuccess(requestId, 'response payload');

      // Make sure the response came out the other end
      const result = await completionPromise;
      expect(result).toStrictEqual('response payload');
    });

    it('should fail to send long (> 15kb) v1 RPC request', async () => {
      const longPayload = new Array<string>(20_000).fill('A').join('');

      const performRpcPromise = rpcClientManager.performRpc({
        destinationIdentity: 'destination-identity',
        method: 'test-method',
        payload: longPayload,
      });

      await expect(performRpcPromise).rejects.toThrow('Request payload too large');
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
        (_identity) => CLIENT_PROTOCOL_DATA_STREAM_RPC, // (other participant is "v2")
        () => undefined,
      );
    });

    function mockTextStreamReader(payload: string) {
      return { readAll: vi.fn().mockResolvedValue(payload) } as any;
    }

    it('should send short v2 RPC request via data stream (happy path)', async () => {
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
          topic: RPC_REQUEST_DATA_STREAM_TOPIC,
          destinationIdentities: ['destination-identity'],
          attributes: expect.objectContaining({
            [RpcRequestAttrs.RPC_REQUEST_ID]: requestId,
            [RpcRequestAttrs.RPC_REQUEST_METHOD]: 'test-method',
            [RpcRequestAttrs.RPC_REQUEST_VERSION]: '2',
          }),
        }),
      );
      expect(mockStreamTextWriter.write).toHaveBeenCalledWith('request-payload');
      expect(mockStreamTextWriter.close).toHaveBeenCalled();

      // No packet should have been emitted
      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);

      // Asynchronously send a response back
      rpcClientManager.handleIncomingRpcAck(requestId);
      await rpcClientManager.handleIncomingDataStream(
        mockTextStreamReader('response-payload'),
        'destination-identity',
        { [RpcRequestAttrs.RPC_REQUEST_ID]: requestId },
      );

      await expect(completionPromise).resolves.toStrictEqual('response-payload');
    });

    it('should send long (> 15kb) v2 RPC request via data stream', async () => {
      const managerEvents = subscribeToEvents<RpcClientManagerCallbacks>(rpcClientManager, [
        'sendDataPacket',
      ]);

      const longPayload = new Array<string>(20_000).fill('A').join('');

      const [requestId, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'destination-identity',
        method: 'test-method',
        payload: longPayload,
      });

      // Verify the data stream was used with correct attributes
      expect(mockOutgoingDataStreamManager.streamText).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: RPC_REQUEST_DATA_STREAM_TOPIC,
          destinationIdentities: ['destination-identity'],
          attributes: expect.objectContaining({
            [RpcRequestAttrs.RPC_REQUEST_ID]: requestId,
            [RpcRequestAttrs.RPC_REQUEST_METHOD]: 'test-method',
            [RpcRequestAttrs.RPC_REQUEST_VERSION]: '2',
          }),
        }),
      );
      expect(mockStreamTextWriter.write).toHaveBeenCalledWith(longPayload);
      expect(mockStreamTextWriter.close).toHaveBeenCalled();

      // No packet should have been emitted
      expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);

      rpcClientManager.handleIncomingRpcAck(requestId);
      await rpcClientManager.handleIncomingDataStream(
        mockTextStreamReader('response-payload'),
        'destination-identity',
        { [RpcRequestAttrs.RPC_REQUEST_ID]: requestId },
      );

      await expect(completionPromise).resolves.toStrictEqual('response-payload');
    });

    it('should handle a v2 RPC request timeout', async () => {
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

    it('should handle a v2 RPC error response', async () => {
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

    it('should handle participant disconnection during v2 RPC request', async () => {
      const [, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'remote-identity',
        method: 'disconnectMethod',
        payload: 'disconnectPayload',
      });

      rpcClientManager.handleParticipantDisconnected('remote-identity');

      await expect(completionPromise).rejects.toThrow('Recipient disconnected');
    });

    it('should send V2 RPC request and ensure that a non matching response does not complete the RPC', async () => {
      // Step 1: send an example rpc request
      const [, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'destination-identity',
        method: 'test-method',
        payload: 'test payload',
      });

      // Step 2: send an acknowledgement / response for a different rpc
      rpcClientManager.handleIncomingRpcAck('bogus request id');
      await rpcClientManager.handleIncomingDataStream(
        mockTextStreamReader('response-payload'),
        'destination-identity',
        { [RpcRequestAttrs.RPC_REQUEST_ID]: 'bogus request id' },
      );

      // Step 3: Make sure that the completion promise didn't resolve.
      await expect(
        Promise.race([completionPromise, Promise.resolve('still pending')]),
      ).resolves.toStrictEqual('still pending');
    });

    it('should ensure that many rpc requests generate different request ids', async () => {
      const requestIds: Array<string> = [];
      for (let i = 0; i < 5; i += 1) {
        const [requestId] = await rpcClientManager.performRpc({
          destinationIdentity: 'destination-identity',
          method: 'test-method',
          payload: 'test payload',
        });
        requestIds.push(requestId);
      }

      // Make sure all request ids are unique
      for (let i = 0; i < requestIds.length; i += 1) {
        for (let j = 0; j < requestIds.length; j += 1) {
          if (i === j) {
            continue;
          }
          expect(requestIds[i]).not.toStrictEqual(requestIds[j]);
        }
      }
    });

    it('should not drop ack and response that arrive before publish completes', async () => {
      // Hold the publish path open by blocking writer.close() until we explicitly resolve it.
      let resolveClose!: () => void;
      const closeBlocked = new Promise<void>((resolve) => {
        resolveClose = resolve;
      });
      mockStreamTextWriter.close = vi.fn().mockReturnValue(closeBlocked);

      // Start performRpc but don't await its return yet. The synchronous prefix runs streamText.
      const performRpcPromise = rpcClientManager.performRpc({
        destinationIdentity: 'destination-identity',
        method: 'test-method',
        payload: 'request-payload',
        responseTimeout: 200,
      });

      // streamText was called synchronously; pull the request id out of the attributes.
      const streamTextCalls = (mockOutgoingDataStreamManager.streamText as ReturnType<typeof vi.fn>)
        .mock.calls;
      expect(streamTextCalls.length).toBe(1);
      const requestId = streamTextCalls[0][0].attributes[RpcRequestAttrs.RPC_REQUEST_ID];

      // Deliver ack and response BEFORE close() unblocks - the publish has not yet returned.
      rpcClientManager.handleIncomingRpcAck(requestId);
      await rpcClientManager.handleIncomingDataStream(
        mockTextStreamReader('response-payload'),
        'destination-identity',
        { [RpcRequestAttrs.RPC_REQUEST_ID]: requestId },
      );

      // Now allow the publish path to complete.
      resolveClose();

      const [, completionPromise] = await performRpcPromise;
      await expect(completionPromise).resolves.toStrictEqual('response-payload');
    });

    it('should ignore a late ack and response that arrive after ack-timeout fires', async () => {
      vi.useFakeTimers();

      try {
        const [requestId, completionPromise] = await rpcClientManager.performRpc({
          destinationIdentity: 'remote-identity',
          method: 'test-method',
          payload: 'test-payload',
        });

        // Register the rejection handler before advancing so the rejection is caught.
        const rejectPromise = expect(completionPromise).rejects.toThrow(/Connection timeout/i);

        // Advance past the ack-timeout window (maxRoundTripLatencyMs = 7000ms).
        await vi.advanceTimersByTimeAsync(7001);

        await rejectPromise;

        // A delayed ack and response now arrive for the same request id - should be silently
        // ignored: no throw, no second resolution, no unhandled rejection.
        expect(() => rpcClientManager.handleIncomingRpcAck(requestId)).not.toThrow();
        await rpcClientManager.handleIncomingDataStream(
          mockTextStreamReader('late response'),
          'remote-identity',
          { [RpcRequestAttrs.RPC_REQUEST_ID]: requestId },
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should not resolve a v2 response stream that comes from a wrong sender identity', async () => {
      const [requestId, completionPromise] = await rpcClientManager.performRpc({
        destinationIdentity: 'alice',
        method: 'test-method',
        payload: 'test payload',
      });

      rpcClientManager.handleIncomingRpcAck(requestId);

      // Simulate a v2 response data stream that arrived purportedly from "mallory" rather
      // than the destination identity "alice".
      await rpcClientManager.handleIncomingDataStream(
        mockTextStreamReader('malicious response'),
        'mallory',
        { [RpcRequestAttrs.RPC_REQUEST_ID]: requestId },
      );

      // The completionPromise must remain pending - the wrong-sender response is ignored.
      await expect(
        Promise.race([completionPromise, Promise.resolve('still pending')]),
      ).resolves.toStrictEqual('still pending');
    });
  });
});
