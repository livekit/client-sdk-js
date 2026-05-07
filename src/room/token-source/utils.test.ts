import { TokenSourceResponse } from '@livekit/protocol';
import { describe, expect, it } from 'vitest';
import { TOKENS } from './test-tokens';
import { areTokenSourceFetchOptionsEqual, decodeTokenPayload, isResponseTokenValid } from './utils';

describe('isResponseTokenValid', () => {
  it('should find a valid jwt not expired', () => {
    const isValid = isResponseTokenValid(
      TokenSourceResponse.fromJson({
        serverUrl: 'ws://localhost:7800',
        participantToken: TOKENS.VALID,
      }),
    );
    expect(isValid).toBe(true);
  });
  it('should find a long ago expired jwt as expired', () => {
    const isValid = isResponseTokenValid(
      TokenSourceResponse.fromJson({
        serverUrl: 'ws://localhost:7800',
        participantToken: TOKENS.EXP_IN_PAST,
      }),
    );
    expect(isValid).toBe(false);
  });
  it('should find a jwt that has not become active yet as expired', () => {
    const isValid = isResponseTokenValid(
      TokenSourceResponse.fromJson({
        serverUrl: 'ws://localhost:7800',
        participantToken: TOKENS.NBF_IN_FUTURE,
      }),
    );
    expect(isValid).toBe(false);
  });
});

describe('decodeTokenPayload', () => {
  it('should extract roomconfig metadata from a token', () => {
    const payload = decodeTokenPayload(TOKENS.VALID);
    expect(payload.roomConfig?.name).toBe('test room name');
    expect(payload.roomConfig?.agents).toHaveLength(1);
    expect(payload.roomConfig?.agents![0].agentName).toBe('test agent name');
    expect(payload.roomConfig?.agents![0].metadata).toBe('test agent metadata');
  });
  it('should extract roomconfig metadata from a token with extra fields', () => {
    const payload = decodeTokenPayload(TOKENS.EXTRA_FIELDS);
    expect(payload.roomConfig?.name).toBe('test room name');
    expect(payload.roomConfig?.agents).toHaveLength(1);
    expect(payload.roomConfig?.agents![0].agentName).toBe('test agent name');
    expect(payload.roomConfig?.agents![0].metadata).toBe('test agent metadata');

    // Make sure the extra fields aren't in the payload, just the ones in the protobuf
    expect((payload.roomConfig as any)?.extraField).toBeUndefined();
    expect((payload.roomConfig?.agents![0] as any)?.extraField).toBeUndefined();
  });
});

describe('areTokenSourceFetchOptionsEqual', () => {
  it('should ensure two identical options objects of different references are equal', () => {
    expect(
      areTokenSourceFetchOptionsEqual(
        { agentName: 'my agent name' },
        { agentName: 'my agent name' },
      ),
    ).to.equal(true);
  });
  it('should ensure two empty options objects are equal', () => {
    expect(areTokenSourceFetchOptionsEqual({}, {})).to.equal(true);
  });
  it('should ensure empty on the left and filled on the right are not equal', () => {
    expect(areTokenSourceFetchOptionsEqual({}, { agentName: 'my agent name' })).to.equal(false);
  });
  it('should ensure filled on the left and empty on the right are not equal', () => {
    expect(areTokenSourceFetchOptionsEqual({ agentName: 'my agent name' }, {})).to.equal(false);
  });
  it('should ensure objects with different keys/values are not equal', () => {
    expect(
      areTokenSourceFetchOptionsEqual(
        { agentName: 'foo' },
        { agentName: 'bar', agentMetadata: 'baz' },
      ),
    ).to.equal(false);
    expect(
      areTokenSourceFetchOptionsEqual(
        { agentName: 'bar', agentMetadata: 'baz' },
        { agentName: 'foo' },
      ),
    ).to.equal(false);
  });
});
