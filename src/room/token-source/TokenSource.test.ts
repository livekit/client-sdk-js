/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenSource } from './TokenSource';
import { TokenSourceFetchOptions } from './types';
import { RoomConfiguration } from '@livekit/protocol';

const EXAMPLE_FETCH_OPTIONS: TokenSourceFetchOptions = {
  roomName: "room name",
  participantName: "participant name",
  participantIdentity: "participant identity",
  participantMetadata: '{"example": "metadata here"}',
  participantAttributes: {},

  agentName: "agent name",
  agentMetadata: '{"example": "agent metadata here"}',
};

const EXAMPLE_TOKEN_ENDPOINT_RESPONSE_JSON = {
  server_url: 'wss://localhost:7000',
  participant_token: 'bogus token'
};

function mockGlobalFetchResponse(
  responseJson: any = EXAMPLE_TOKEN_ENDPOINT_RESPONSE_JSON,
  responseOptions: ResponseInit = {
    status: 200,
    headers: { "Content-Type": "application/json" }
  },
) {
  const oldFetch = globalThis.fetch;

  const response = new Response(JSON.stringify(responseJson), responseOptions);

  const fetchMock = vi.fn().mockResolvedValueOnce(response);
  globalThis.fetch = fetchMock;

  const teardown = () => {
    globalThis.fetch = oldFetch;
  };

  return { fetchMock: fetchMock.mock, teardown };
}

describe('TokenSource.endpoint', () => {
  it('tests happy path case', async () => {
    const { teardown, fetchMock } = mockGlobalFetchResponse();

    try {
      const tokenSource = TokenSource.endpoint("https://example.com/my/token/endpoint");
      await tokenSource.fetch(EXAMPLE_FETCH_OPTIONS);
      expect(fetchMock.lastCall).toStrictEqual([
        "https://example.com/my/token/endpoint",
        {
          method: "POST",
          body: JSON.stringify({
            "room_name": "room name",
            "participant_name": "participant name",
            "participant_identity": "participant identity",
            "participant_metadata": "{\"example\": \"metadata here\"}",
            "room_config": {
              "agents": [
                {
                  "agent_name": "agent name",
                  "metadata": "{\"example\": \"agent metadata here\"}"
                }
              ]
            }
          }),
          headers: { "Content-Type": "application/json" },
        },
      ]);
    } finally {
      teardown();
    }
  });
});
