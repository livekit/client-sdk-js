import { JoinResponse, ReconnectResponse } from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';
import { sleep } from '../room/utils';
import { SignalAPI } from './SignalAPI';
import type { ITransport } from './SignalAPI';

// A helper to create a minimal dummy transport whose methods are jest/vi spies
function createDummyTransport(overrides: Partial<ITransport> = {}): ITransport {
  // placeholders that will be overridden when `onMessage` / `onError` are registered
  let messageHandler: ((data: Uint8Array) => void) | undefined;
  let errorHandler: ((error: Error) => void) | undefined;

  const dummyTransport: ITransport = {
    connect: vi.fn(async (...args: unknown[]) => {
      void args; // silence unused parameter lint errors
      return {} as unknown as JoinResponse;
    }),
    send: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    reconnect: vi.fn(async () => ({}) as unknown as ReconnectResponse),
    onMessage: (cb) => {
      messageHandler = cb;
    },
    onError: (cb) => {
      errorHandler = cb;
    },
    ...overrides,
  } as ITransport;

  // Expose ways to trigger the callbacks inside tests
  // @ts-expect-error – we attach these for test-only usage
  dummyTransport.__triggerMessage = (data: Uint8Array) => messageHandler?.(data);
  // @ts-expect-error – we attach these for test-only usage
  dummyTransport.__triggerError = (err: Error) => errorHandler?.(err);

  return dummyTransport;
}

describe('SignalAPI', () => {
  it('calls transport.connect when join is invoked', async () => {
    const joinResponse = { joined: true } as unknown as JoinResponse;

    const transport = createDummyTransport({
      connect: vi.fn(async () => joinResponse),
    });

    const api = new SignalAPI(transport);
    void api;

    const url = 'wss://example.com';
    const token = 'fake-token';

    const result = await api.join(url, token);

    expect(transport.connect).toHaveBeenCalledWith(url, token);
    expect(result).toBe(joinResponse);
  });

  it('forwards reconnect to transport.reconnect', async () => {
    const reconnectResponse = { reconnected: true } as unknown as ReconnectResponse;

    const transport = createDummyTransport({
      reconnect: vi.fn(async () => reconnectResponse),
    });

    const api = new SignalAPI(transport);
    void api;

    const result = await api.reconnect();

    expect(transport.reconnect).toHaveBeenCalled();
    expect(result).toBe(reconnectResponse);
  });

  it('handles onMessage events from the transport', () => {
    const transport = createDummyTransport();
    const api = new SignalAPI(transport);
    void api;

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // @ts-expect-error – trigger helper added in createDummyTransport
    transport.__triggerMessage(new Uint8Array([1, 2, 3]));

    expect(consoleSpy).toHaveBeenCalledWith('onMessage', new Uint8Array([1, 2, 3]));

    consoleSpy.mockRestore();
  });

  it('handles onError events from the transport', () => {
    const transport = createDummyTransport();
    const api = new SignalAPI(transport);
    void api;

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const error = new Error('dummy');
    // @ts-expect-error – trigger helper added in createDummyTransport
    transport.__triggerError(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith('onError', error);

    consoleErrorSpy.mockRestore();
  });

  it('ensures parallel join calls are executed sequentially', async () => {
    const resolvers: Array<() => void> = [];

    const connect = vi.fn((url: string, token: string) => {
      void url;
      void token;
      return new Promise<JoinResponse>((resolve) => {
        resolvers.push(() => resolve({} as unknown as JoinResponse));
      });
    });

    const transport = createDummyTransport({ connect });
    const api = new SignalAPI(transport);
    void api;

    // Trigger two join calls without awaiting the first
    const joinPromise1 = api.join('wss://example.com', 'token-1');
    const joinPromise2 = api.join('wss://example.com', 'token-2');

    // Only the first connect should have been invoked at this point
    await sleep(5);
    expect(connect).toHaveBeenCalledTimes(1);

    // Resolve the first join
    resolvers[0]();
    await joinPromise1;

    // Now the second connect should have been called
    await sleep(5);
    expect(connect).toHaveBeenCalledTimes(2);

    // Resolve the second join
    resolvers[1]();
    await joinPromise2;
  });
});
