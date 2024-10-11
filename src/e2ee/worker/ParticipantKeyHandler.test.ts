import { describe, expect, it, vitest } from 'vitest';
import { ENCRYPTION_ALGORITHM, KEY_PROVIDER_DEFAULTS } from '../constants';
import { KeyHandlerEvent } from '../events';
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

  describe('ratchetKey', () => {
    it('emits event', async () => {
      const keyHandler = new ParticipantKeyHandler(participantIdentity, KEY_PROVIDER_DEFAULTS);

      const material = await createKeyMaterialFromString('password');

      const keyRatched = vitest.fn();

      keyHandler.on(KeyHandlerEvent.KeyRatcheted, keyRatched);

      await keyHandler.setKey(material);

      await keyHandler.ratchetKey();

      const newMaterial = keyHandler.getKeySet()?.material;

      expect(keyRatched).toHaveBeenCalledWith(newMaterial, participantIdentity, 0);
    });

    it('ratchets keys predictably', async () => {
      // we can't extract the keys directly, so we instead use them to encrypt a known plaintext
      const keyHandler = new ParticipantKeyHandler(participantIdentity, KEY_PROVIDER_DEFAULTS);

      const originalMaterial = await createKeyMaterialFromString('password');

      await keyHandler.setKey(originalMaterial);

      const ciphertexts: Uint8Array[] = [];

      const plaintext = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

      const iv = new Uint8Array(12);
      const additionalData = new Uint8Array(0);

      for (let i = 0; i < 10; i++) {
        const { encryptionKey } = keyHandler.getKeySet()!;

        const ciphertext = await crypto.subtle.encrypt(
          {
            name: ENCRYPTION_ALGORITHM,
            iv,
            additionalData,
          },
          encryptionKey,
          plaintext,
        );
        ciphertexts.push(new Uint8Array(ciphertext));
        await keyHandler.ratchetKey();
      }
      // check that all ciphertexts are unique
      expect(new Set(ciphertexts.map((x) => new TextDecoder().decode(x))).size).toEqual(
        ciphertexts.length,
      );
      expect(ciphertexts).matchSnapshot('ciphertexts');
    });
  });
});
