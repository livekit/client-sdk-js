/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi } from 'vitest';
import { sleep } from '../utils';
import { TokenSource } from './TokenSource';
import { TOKENS } from './test-tokens';
import { TokenSourceFetchOptions, TokenSourceResponseObject } from './types';

const EXAMPLE_FETCH_OPTIONS: TokenSourceFetchOptions = {
  roomName: 'room name',
  participantName: 'participant name',
  participantIdentity: 'participant identity',
  participantMetadata: '{"example": "metadata here"}',
  participantAttributes: {},

  agentName: 'agent name',
  agentMetadata: '{"example": "agent metadata here"}',
};

const EXAMPLE_TOKEN_ENDPOINT_RESPONSE_JSON = {
  server_url: 'wss://localhost:7000',
  participant_token: 'bogus token',
};

function makeResponseObject(token: string = TOKENS.VALID): TokenSourceResponseObject {
  return {
    serverUrl: 'wss://localhost:7000',
    participantToken: token,
  };
}

function mockGlobalFetchResponse(
  responseJson: any = EXAMPLE_TOKEN_ENDPOINT_RESPONSE_JSON,
  responseOptions?: ResponseInit,
) {
  return mockGlobalFetchResponses([{ responseJson, responseOptions }]);
}

function mockGlobalFetchResponses(
  responses: Array<{
    responseJson?: any;
    responseOptions?: ResponseInit;
  }>,
) {
  const oldFetch = globalThis.fetch;

  const fetchMock = vi.fn();
  for (const {
    responseJson = EXAMPLE_TOKEN_ENDPOINT_RESPONSE_JSON,
    responseOptions,
  } of responses) {
    const response = new Response(JSON.stringify(responseJson), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      ...responseOptions,
    });
    fetchMock.mockResolvedValueOnce(response);
  }
  globalThis.fetch = fetchMock;

  const teardown = () => {
    globalThis.fetch = oldFetch;
  };

  return { fetchMock: fetchMock.mock, teardown };
}

describe('TokenSource.endpoint', () => {
  it('tests happy path with all options', async () => {
    const { teardown, fetchMock } = mockGlobalFetchResponse();

    try {
      const tokenSource = TokenSource.endpoint('https://example.com/my/token/endpoint');
      await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
      expect(fetchMock.lastCall).toStrictEqual([
        'https://example.com/my/token/endpoint',
        {
          method: 'POST',
          body: JSON.stringify({
            room_name: 'room name',
            participant_name: 'participant name',
            participant_identity: 'participant identity',
            participant_metadata: '{"example": "metadata here"}',
            room_config: {
              agents: [
                {
                  agent_name: 'agent name',
                  metadata: '{"example": "agent metadata here"}',
                },
              ],
            },
          }),
          headers: { 'Content-Type': 'application/json' },
        },
      ]);
    } finally {
      teardown();
    }
  });

  it('tests happy path with no options', async () => {
    const { teardown, fetchMock } = mockGlobalFetchResponse();

    try {
      const tokenSource = TokenSource.endpoint('https://example.com/my/token/endpoint');
      await tokenSource.fetch({});
      expect(fetchMock.lastCall).toStrictEqual([
        'https://example.com/my/token/endpoint',
        {
          method: 'POST',
          body: JSON.stringify({}),
          headers: { 'Content-Type': 'application/json' },
        },
      ]);
    } finally {
      teardown();
    }
  });

  it('throws on non-200 response', async () => {
    const { teardown } = mockGlobalFetchResponse(
      { error: 'forbidden' },
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );

    try {
      const tokenSource = TokenSource.endpoint('https://example.com/my/token/endpoint');
      await expect(tokenSource.fetch(EXAMPLE_FETCH_OPTIONS)).rejects.toThrow(/received 403/);
    } finally {
      teardown();
    }
  });

  it('merges custom headers from EndpointOptions', async () => {
    const { teardown, fetchMock } = mockGlobalFetchResponse();

    try {
      const tokenSource = TokenSource.endpoint('https://example.com/my/token/endpoint', {
        headers: { Authorization: 'Bearer my-token', 'X-Custom': 'value' },
      });
      await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
      expect((fetchMock.lastCall![1] as RequestInit).headers).toStrictEqual({
        'Content-Type': 'application/json',
        Authorization: 'Bearer my-token',
        'X-Custom': 'value',
      });
    } finally {
      teardown();
    }
  });

  it('sends only provided fields in request body', async () => {
    const { teardown, fetchMock } = mockGlobalFetchResponse();

    try {
      const tokenSource = TokenSource.endpoint('https://example.com/my/token/endpoint');
      await tokenSource.fetch({ roomName: 'my-room' });
      const body = JSON.parse((fetchMock.lastCall![1] as RequestInit).body as string);
      expect(body.room_name).toStrictEqual('my-room');
      // Agent-related fields should not be present since they weren't provided
      expect(body.room_config).toBeUndefined();
    } finally {
      teardown();
    }
  });

  it('deserializes response with extra unknown fields without error', async () => {
    const { teardown } = mockGlobalFetchResponse({
      server_url: 'wss://localhost:7000',
      participant_token: TOKENS.VALID,
      some_future_field: 'should be ignored',
      another_unknown: 42,
    });

    try {
      const tokenSource = TokenSource.endpoint('https://example.com/my/token/endpoint');
      const result = await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
      expect(result.serverUrl).toStrictEqual('wss://localhost:7000');
      expect(result.participantToken).toStrictEqual(TOKENS.VALID);
    } finally {
      teardown();
    }
  });
});

describe('TokenSource.custom', () => {
  it('calls custom function and resolves result', async () => {
    const customFn = vi.fn().mockResolvedValue(makeResponseObject());

    const tokenSource = TokenSource.custom(customFn);
    const result = await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);

    expect(customFn).toHaveBeenCalledWith(EXAMPLE_FETCH_OPTIONS);
    expect(result.serverUrl).toStrictEqual('wss://localhost:7000');
    expect(result.participantToken).toStrictEqual(TOKENS.VALID);
  });

  it('deserializes response with extra unknown fields without error', async () => {
    const customFn = vi.fn().mockResolvedValue({
      ...makeResponseObject(),
      someFutureField: 'should be ignored',
      anotherUnknown: 42,
    });

    const tokenSource = TokenSource.custom(customFn);
    const result = await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);

    expect(result.serverUrl).toStrictEqual('wss://localhost:7000');
    expect(result.participantToken).toStrictEqual(TOKENS.VALID);
  });
});

describe('TokenSourceConfigurable caching behavior (via TokenSource.custom)', () => {
  it('returns cached value on second call with same options', async () => {
    const customFn = vi.fn().mockResolvedValue(makeResponseObject());

    const tokenSource = TokenSource.custom(customFn);
    const result1 = await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
    const result2 = await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);

    expect(customFn).toHaveBeenCalledTimes(1);
    expect(result1).toStrictEqual(result2);
  });

  it('refetches when fetch options change', async () => {
    const customFn = vi.fn().mockResolvedValue(makeResponseObject());

    const tokenSource = TokenSource.custom(customFn);
    await tokenSource.fetch({ roomName: 'room-1' });
    await tokenSource.fetch({ roomName: 'room-2' });

    expect(customFn).toHaveBeenCalledTimes(2);
    expect(customFn).toHaveBeenNthCalledWith(1, { roomName: 'room-1' });
    expect(customFn).toHaveBeenNthCalledWith(2, { roomName: 'room-2' });
  });

  it('refetches when force is true even with same options', async () => {
    const customFn = vi.fn().mockResolvedValue(makeResponseObject());

    const tokenSource = TokenSource.custom(customFn);
    await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
    await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS, true);

    expect(customFn).toHaveBeenCalledTimes(2);
  });

  it('refetches when cached token is expired', async () => {
    const customFn = vi
      .fn()
      .mockResolvedValueOnce(makeResponseObject(TOKENS.EXP_IN_PAST))
      .mockResolvedValueOnce(makeResponseObject(TOKENS.VALID));

    const tokenSource = TokenSource.custom(customFn);
    await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
    await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);

    // Should have called twice because the first token was expired
    expect(customFn).toHaveBeenCalledTimes(2);
  });

  it('caches across multiple calls when token remains valid', async () => {
    const customFn = vi.fn().mockResolvedValue(makeResponseObject());

    const tokenSource = TokenSource.custom(customFn);
    await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
    await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
    await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
    await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);

    expect(customFn).toHaveBeenCalledTimes(1);
  });

  it('refetches when any single option field changes', async () => {
    const customFn = vi.fn().mockResolvedValue(makeResponseObject());
    const tokenSource = TokenSource.custom(customFn);

    const baseOptions: TokenSourceFetchOptions = {
      roomName: 'room',
      participantName: 'name',
      participantIdentity: 'identity',
      participantMetadata: 'meta',
      participantAttributes: { key: 'value' },
      agentName: 'agent',
      agentMetadata: 'agent-meta',
    };

    await tokenSource.fetch(baseOptions);
    expect(customFn).toHaveBeenCalledTimes(1);

    // Changing participantIdentity should invalidate cache
    await tokenSource.fetch({ ...baseOptions, participantIdentity: 'different-identity' });
    expect(customFn).toHaveBeenCalledTimes(2);
  });

  it('getCachedResponseJwtPayload returns null before first fetch', () => {
    const tokenSource = TokenSource.custom(async () => makeResponseObject());
    expect(tokenSource.getCachedResponseJwtPayload()).toBeNull();
  });

  it('getCachedResponseJwtPayload returns decoded payload after fetch', async () => {
    const tokenSource = TokenSource.custom(async () => makeResponseObject());
    await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);

    const payload = tokenSource.getCachedResponseJwtPayload();
    expect(payload).not.toBeNull();
    expect(payload!.sub).toStrictEqual('1234567890');
    expect(payload!.roomConfig?.name).toStrictEqual('test room name');
  });

  it('serializes concurrent fetches via mutex', async () => {
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;

    const customFn = vi.fn().mockImplementation(async () => {
      concurrentCalls += 1;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);

      // Simulate async work
      await sleep(10);

      concurrentCalls -= 1;
      return makeResponseObject();
    });

    const tokenSource = TokenSource.custom(customFn);

    // Launch concurrent fetches with different options so caching doesn't short-circuit
    await Promise.all([
      tokenSource.fetch({ roomName: 'room-1' }),
      tokenSource.fetch({ roomName: 'room-2' }),
      tokenSource.fetch({ roomName: 'room-3' }),
    ]);

    // The mutex should ensure only one fetch runs at a time
    expect(maxConcurrentCalls).toStrictEqual(1);
    expect(customFn).toHaveBeenCalledTimes(3);
  });
});
