import { beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../../../logger';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { CLIENT_PROTOCOL_DEFAULT } from '../../../version';
import type RTCEngine from '../../RTCEngine';
import OutgoingDataStreamManager from '../../data-stream/outgoing/OutgoingDataStreamManager';
import { sleep } from '../../utils';
import { RpcError } from '../utils';
import type { RpcClientManagerCallbacks } from './events';
import RpcClientManager from './RpcClientManager';

describe('RpcClientManager', () => {
  let rpcClientManager: RpcClientManager;

  beforeEach(() => {
    const outgoingDataStreamManager = new OutgoingDataStreamManager(
      {} as unknown as RTCEngine,
      log,
    );

    rpcClientManager = new RpcClientManager(
      log,
      outgoingDataStreamManager,
      (_identity) => CLIENT_PROTOCOL_DEFAULT,
      () => undefined,
    );
  });

  it.skip('should send a rpc message to a participant (legacy path)', async () => {
    const managerEvents = subscribeToEvents<RpcClientManagerCallbacks>(rpcClientManager, [
      'sendDataPacket',
    ]);

    const [requestId, completionPromise] = await rpcClientManager.performRpc({
      destinationIdentity: 'destination-identity',
      method: 'test-method',
      payload: 'request-payload',
    });

    const { packet } = await managerEvents.waitFor('sendDataPacket');
    expect(packet.value.case).toStrictEqual('rpcRequest');
    expect(packet.value.value.id).toStrictEqual(requestId);
    expect(packet.value.value.method).toStrictEqual('test-method');
    expect(packet.value.value.payload).toStrictEqual('request-payload');
    expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);

    rpcClientManager.handleIncomingRpcAck(requestId);

    rpcClientManager.handleIncomingRpcResponseSuccess(requestId, 'response-payload');

    await expect(completionPromise).resolves.toStrictEqual('response-payload');
  });

  it('should send RPC request and receive successful response', async () => {
    const managerEvents = subscribeToEvents<RpcClientManagerCallbacks>(rpcClientManager, [
      'sendDataPacket',
    ]);

    const method = 'testMethod';
    const payload = 'testPayload';
    const responsePayload = 'responsePayload';

    const [requestId, completionPromise] = await rpcClientManager.performRpc({
      destinationIdentity: 'remote-identity',
      method,
      payload,
    });

    // Verify exactly one packet was emitted
    await managerEvents.waitFor('sendDataPacket');
    expect(managerEvents.areThereBufferedEvents('sendDataPacket')).toBe(false);

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
    const managerEvents = subscribeToEvents<RpcClientManagerCallbacks>(rpcClientManager, [
      'sendDataPacket',
    ]);

    vi.useFakeTimers();

    try {
      const method = 'timeoutMethod';
      const payload = 'timeoutPayload';
      const timeout = 50;

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
    const managerEvents = subscribeToEvents<RpcClientManagerCallbacks>(rpcClientManager, [
      'sendDataPacket',
    ]);

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

  it('should handle participant disconnection during RPC request', async () => {
    const managerEvents = subscribeToEvents<RpcClientManagerCallbacks>(rpcClientManager, [
      'sendDataPacket',
    ]);

    const method = 'disconnectMethod';
    const payload = 'disconnectPayload';

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
