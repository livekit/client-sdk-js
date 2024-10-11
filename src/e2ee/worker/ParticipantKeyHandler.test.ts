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

  it('marks invalid if more than failureTolerance failures', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      failureTolerance: 2,
    });
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

  it('marks valid on encryption success', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      failureTolerance: 0,
    });

    expect(keyHandler.hasValidKey).toBe(true);

    keyHandler.decryptionFailure();

    expect(keyHandler.hasValidKey).toBe(false);

    keyHandler.decryptionSuccess();

    expect(keyHandler.hasValidKey).toBe(true);
  });

  it('marks valid on new key', async () => {
    const keyHandler = new ParticipantKeyHandler(participantIdentity, {
      ...KEY_PROVIDER_DEFAULTS,
      failureTolerance: 0,
    });

    expect(keyHandler.hasValidKey).toBe(true);

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

  it('allows many failures if failureTolerance is -1', async () => {
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
});
