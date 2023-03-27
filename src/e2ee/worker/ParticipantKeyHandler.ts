import { workerLogger } from '../../logger';
import { KEYRING_SIZE } from '../constants';
import type { KeySet, KeyProviderOptions } from '../types';
import { importKey, ratchet, deriveKeys } from '../utils';

/**
 * ParticipantKeyHandler is responsible for providing a cryptor instance with the
 * en-/decryption key of a participant. It assumes that all tracks of a specific participant
 * are encrypted with the same key.
 * Additionally it exposes a method to ratchet a key which can be used by the cryptor either automatically
 * if decryption fails or can be triggered manually on both sender and receiver side.
 *
 */
export class ParticipantKeyHandler {
  private currentKeyIndex: number;

  private cryptoKeyRing: Array<KeySet>;

  private enabled: boolean;

  private keyProviderOptions: KeyProviderOptions;

  constructor(isEnabled: boolean, keyProviderOptions: KeyProviderOptions) {
    this.currentKeyIndex = 0;
    this.cryptoKeyRing = new Array(KEYRING_SIZE);
    this.enabled = isEnabled;
    this.keyProviderOptions = keyProviderOptions;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Ratchets the current key (or the one at keyIndex if provided) and
   * sets the ratcheted key at the same index on the key ring buffer.
   * @param keyIndex
   */
  async ratchetKey(keyIndex?: number) {
    const currentMaterial = this.getKeySet(keyIndex).material;
    const newMaterial = await importKey(
      await ratchet(currentMaterial, this.keyProviderOptions.ratchetSalt),
      currentMaterial.algorithm.name,
      'derive',
    );

    this.setKeyFromMaterial(newMaterial, keyIndex ?? this.getCurrentKeyIndex());
    // TODO if participant is publisher, send `newMaterial` back to main thread in order to be able to use it as a new announced sender key
  }

  /**
   * takes in a key material with `deriveBits` and `deriveKey` set as key usages
   * and derives encryption keys from the material and sets it on the key ring buffer
   * together with the material
   */
  async setKeyFromMaterial(material: CryptoKey, keyIndex = 0) {
    workerLogger.debug('setting new key');
    if (keyIndex >= 0) {
      this.currentKeyIndex = keyIndex % this.cryptoKeyRing.length;
    }
    this.cryptoKeyRing[this.currentKeyIndex] = await deriveKeys(
      material,
      this.keyProviderOptions.ratchetSalt,
    );
  }

  isEnabled() {
    return this.enabled;
  }

  getCurrentKeyIndex() {
    return this.currentKeyIndex;
  }

  /**
   * returns currently used KeySet or the one at `keyIndex` if provided
   * @param keyIndex
   * @returns
   */
  getKeySet(keyIndex?: number) {
    return this.cryptoKeyRing[keyIndex ?? this.currentKeyIndex];
  }
}
