import { describe, expect, it } from 'vitest';
import { KEY_PROVIDER_DEFAULTS } from '../constants';
import { createKeyMaterialFromString } from '../utils';
import { ParticipantKeyHandler } from './ParticipantKeyHandler';

describe('ParticipantKeyHandler', () => {
  const participantIdentity = 'testParticipant';

  it('keyringSize must be greater than 0', () => {
    expect(() => {
      new ParticipantKeyHandler(participantIdentity, { ...KEY_PROVIDER_DEFAULTS, keyringSize: 0 });
    }).toThrowError(TypeError);
  });

  it('keyringSize must be max 256', () => {
    expect(() => {
      new ParticipantKeyHandler(participantIdentity, {
        ...KEY_PROVIDER_DEFAULTS,
        keyringSize: 257,
      });
    }).toThrowError(TypeError);
  });

  it('get and sets keys at an index', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      keyringSize: 128,
    });
    const materialA = await createKeyMaterialFromString('passwordA');
    const materialB = await createKeyMaterialFromString('passwordB');
    await keyHandler.setKey(materialA, 0);
    expect(keyHandler.getKeySet(0)).toBeDefined();
    expect(keyHandler.getKeySet(0)?.material).toEqual(materialA);
    await keyHandler.setKey(materialB, 0);
    expect(keyHandler.getKeySet(0)?.material).toEqual(materialB);
  });

  it('defaults to key index of 0 when setting key', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
    });

    const materialA = await createKeyMaterialFromString('passwordA');

    await keyHandler.setKey(materialA);

    expect(keyHandler.getKeySet(0)?.material).toEqual(materialA);
  });

  it('defaults to current key index when getting key', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
    });

    const materialA = await createKeyMaterialFromString('passwordA');

    await keyHandler.setKey(materialA, 10);

    expect(keyHandler.getKeySet()?.material).toEqual(materialA);
  });

  it('marks current key invalid if more than failureTolerance failures', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      failureTolerance: 2,
    });

    keyHandler.setCurrentKeyIndex(10);

    expect(keyHandler.hasValidKey).toBe(true);

    // 1
    keyHandler.decryptionFailure();
    expect(keyHandler.hasValidKey).toBe(true);

    // 2
    keyHandler.decryptionFailure();
    expect(keyHandler.hasValidKey).toBe(true);

    // 3
    keyHandler.decryptionFailure();
    expect(keyHandler.hasValidKey).toBe(false);
  });

  it('marks current key valid on encryption success', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      failureTolerance: 0,
    });

    keyHandler.setCurrentKeyIndex(10);

    expect(keyHandler.hasValidKey).toBe(true);
    expect(keyHandler.hasInvalidKeyAtIndex(0)).toBe(false);

    keyHandler.decryptionFailure();

    expect(keyHandler.hasValidKey).toBe(false);

    keyHandler.decryptionSuccess();

    expect(keyHandler.hasValidKey).toBe(true);
  });

  it('marks specific key invalid if more than failureTolerance failures', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      failureTolerance: 2,
    });

    // set the current key to something different from what we are testing
    keyHandler.setCurrentKeyIndex(10);

    expect(keyHandler.hasInvalidKeyAtIndex(5)).toBe(false);

    // 1
    keyHandler.decryptionFailure(5);
    expect(keyHandler.hasInvalidKeyAtIndex(5)).toBe(false);

    // 2
    keyHandler.decryptionFailure(5);
    expect(keyHandler.hasInvalidKeyAtIndex(5)).toBe(false);

    // 3
    keyHandler.decryptionFailure(5);
    expect(keyHandler.hasInvalidKeyAtIndex(5)).toBe(true);

    expect(keyHandler.hasInvalidKeyAtIndex(10)).toBe(false);
  });

  it('marks specific key valid on encryption success', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      failureTolerance: 0,
    });

    // set the current key to something different from what we are testing
    keyHandler.setCurrentKeyIndex(10);

    expect(keyHandler.hasInvalidKeyAtIndex(5)).toBe(false);

    keyHandler.decryptionFailure(5);

    expect(keyHandler.hasInvalidKeyAtIndex(5)).toBe(true);

    keyHandler.decryptionSuccess(5);

    expect(keyHandler.hasInvalidKeyAtIndex(5)).toBe(false);
  });

  it('marks valid on new key', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      failureTolerance: 0,
    });

    keyHandler.setCurrentKeyIndex(10);

    expect(keyHandler.hasValidKey).toBe(true);
    expect(keyHandler.hasInvalidKeyAtIndex(0)).toBe(false);

    keyHandler.decryptionFailure();

    expect(keyHandler.hasValidKey).toBe(false);

    await keyHandler.setKey(await createKeyMaterialFromString('passwordA'));

    expect(keyHandler.hasValidKey).toBe(true);
  });

  it('updates currentKeyIndex on new key', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, KEY_PROVIDER_DEFAULTS);
    const material = await createKeyMaterialFromString('password');

    expect(keyHandler.getCurrentKeyIndex()).toBe(0);

    // default is zero
    await keyHandler.setKey(material);
    expect(keyHandler.getCurrentKeyIndex()).toBe(0);

    // should go to next index
    await keyHandler.setKey(material, 1);
    expect(keyHandler.getCurrentKeyIndex()).toBe(1);

    // should be able to jump ahead
    await keyHandler.setKey(material, 10);
    expect(keyHandler.getCurrentKeyIndex()).toBe(10);
  });

  it('allows currentKeyIndex to be explicitly set', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, KEY_PROVIDER_DEFAULTS);

    keyHandler.setCurrentKeyIndex(10);
    expect(keyHandler.getCurrentKeyIndex()).toBe(10);
  });

  it('allows many failures if failureTolerance is less than zero', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      failureTolerance: -1,
    });
    expect(keyHandler.hasValidKey).toBe(true);
    for (let i = 0; i < 100; i++) {
      keyHandler.decryptionFailure();
      expect(keyHandler.hasValidKey).toBe(true);
    }
  });

  describe('resetKeyStatus', () => {
    it('marks all keys as valid if no index is provided', () => {
      const keyHandler = new ParticipantKeyHandler(participantIdentity, {
        ...KEY_PROVIDER_DEFAULTS,
        failureTolerance: 0,
      });

      for (let i = 0; i < KEY_PROVIDER_DEFAULTS.keyringSize; i++) {
        keyHandler.decryptionFailure(i);
        expect(keyHandler.hasInvalidKeyAtIndex(i)).toBe(true);
      }

      keyHandler.resetKeyStatus();

      for (let i = 0; i < KEY_PROVIDER_DEFAULTS.keyringSize; i++) {
        expect(keyHandler.hasInvalidKeyAtIndex(i)).toBe(false);
      }
    });
  });
});
