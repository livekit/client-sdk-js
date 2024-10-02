import { describe, expect, it } from 'vitest';
import { KEY_PROVIDER_DEFAULTS } from '../constants';
import { ParticipantKeyHandler } from './ParticipantKeyHandler';

describe('ParticipantKeyHandler', () => {
  const participantIdentity = 'testParticipant';

  it('keyringSize must be greater than 0', () => {
    expect(() => {
      new ParticipantKeyHandler(participantIdentity, { ...KEY_PROVIDER_DEFAULTS, keyringSize: 0 });
    }).toThrowError(TypeError);
  });

  it('keyringSize must be less than 256', () => {
    expect(() => {
      new ParticipantKeyHandler(participantIdentity, {
        ...KEY_PROVIDER_DEFAULTS,
        keyringSize: 256,
      });
    }).toThrowError(TypeError);
  });

  it('get and sets keys at an index', () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      keyringSize: 128,
    });
    const keyA = { key: 'a' } as unknown as CryptoKey;
    const keyB = { key: 'b' } as unknown as CryptoKey;
    keyHandler.setKey(keyA, 0);
    expect(keyHandler.getKeySet(0)).toEqual(keyA);
    keyHandler.setKey(keyB, 0);
    expect(keyHandler.getKeySet(0)).toEqual(keyB);
  });
});
