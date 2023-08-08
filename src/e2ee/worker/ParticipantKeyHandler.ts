import { EventEmitter } from 'events';
import type TypedEventEmitter from 'typed-emitter';
import { workerLogger } from '../../logger';
import { KEYRING_SIZE } from '../constants';
import type { KeyProviderOptions, KeySet, ParticipantKeyHandlerCallbacks } from '../types';
import { deriveKeys, importKey, ratchet } from '../utils';

// TODO ParticipantKeyHandlers currently don't get destroyed on participant disconnect
// we could do this by having a separate worker message on participant disconnected.

/**
 * ParticipantKeyHandler is responsible for providing a cryptor instance with the
 * en-/decryption key of a participant. It assumes that all tracks of a specific participant
 * are encrypted with the same key.
 * Additionally it exposes a method to ratchet a key which can be used by the cryptor either automatically
 * if decryption fails or can be triggered manually on both sender and receiver side.
 *
 */
export class ParticipantKeyHandler extends (EventEmitter as new () => TypedEventEmitter<ParticipantKeyHandlerCallbacks>) {
  private currentKeyIndex: number;

  private cryptoKeyRing: Array<KeySet>;

  private enabled: boolean;

  private keyProviderOptions: KeyProviderOptions;

  private ratchetPromiseMap: Map<number, Promise<CryptoKey>>;

  private participantId: string | undefined;

  private decryptionFailureCount = 0;

  private _hasValidKey: boolean = true;

  get hasValidKey() {
    return this._hasValidKey;
  }

  constructor(
    participantId: string | undefined,
    isEnabled: boolean,
    keyProviderOptions: KeyProviderOptions,
  ) {
    super();
    this.currentKeyIndex = 0;
    this.cryptoKeyRing = new Array(KEYRING_SIZE);
    this.enabled = isEnabled;
    this.keyProviderOptions = keyProviderOptions;
    this.ratchetPromiseMap = new Map();
    this.participantId = participantId;
    this.resetKeyStatus();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  decryptionFailure() {
    if (this.keyProviderOptions.failureTolerance < 0) {
      return;
    }
    this.decryptionFailureCount += 1;

    if (this.decryptionFailureCount > this.keyProviderOptions.failureTolerance) {
      workerLogger.warn(`key for ${this.participantId} is being marked as invalid`);
      this._hasValidKey = false;
    }
  }

  decryptionSuccess() {
    this.resetKeyStatus();
  }

  /**
   * Call this after user initiated ratchet or a new key has been set in order to make sure to mark potentially
   * invalid keys as valid again
   */
  resetKeyStatus() {
    this.decryptionFailureCount = 0;
    this._hasValidKey = true;
  }

  /**
   * Ratchets the current key (or the one at keyIndex if provided) and
   * returns the ratcheted material
   * if `setKey` is true (default), it will also set the ratcheted key directly on the crypto key ring
   * @param keyIndex
   * @param setKey
   */
  ratchetKey(keyIndex?: number, setKey = true): Promise<CryptoKey> {
    const currentKeyIndex = (keyIndex ??= this.getCurrentKeyIndex());

    const existingPromise = this.ratchetPromiseMap.get(currentKeyIndex);
    if (typeof existingPromise !== 'undefined') {
      return existingPromise;
    }
    const ratchetPromise = new Promise<CryptoKey>(async (resolve, reject) => {
      try {
        const currentMaterial = this.getKeySet(currentKeyIndex).material;
        const newMaterial = await importKey(
          await ratchet(currentMaterial, this.keyProviderOptions.ratchetSalt),
          currentMaterial.algorithm.name,
          'derive',
        );

        if (setKey) {
          this.setKeyFromMaterial(newMaterial, currentKeyIndex, true);
        }
        this.emit('keyRatcheted', newMaterial, keyIndex, this.participantId);
        resolve(newMaterial);
      } catch (e) {
        reject(e);
      } finally {
        this.ratchetPromiseMap.delete(currentKeyIndex);
      }
    });
    this.ratchetPromiseMap.set(currentKeyIndex, ratchetPromise);
    return ratchetPromise;
  }

  /**
   * takes in a key material with `deriveBits` and `deriveKey` set as key usages
   * and derives encryption keys from the material and sets it on the key ring buffer
   * together with the material
   * also resets the valid key property and updates the currentKeyIndex
   */
  async setKey(material: CryptoKey, keyIndex = 0) {
    await this.setKeyFromMaterial(material, keyIndex);
    this.resetKeyStatus();
  }

  /**
   * takes in a key material with `deriveBits` and `deriveKey` set as key usages
   * and derives encryption keys from the material and sets it on the key ring buffer
   * together with the material
   * also updates the currentKeyIndex
   */
  async setKeyFromMaterial(material: CryptoKey, keyIndex = 0, emitRatchetEvent = false) {
    workerLogger.debug('setting new key');
    if (keyIndex >= 0) {
      this.currentKeyIndex = keyIndex % this.cryptoKeyRing.length;
    }
    const keySet = await deriveKeys(material, this.keyProviderOptions.ratchetSalt);
    this.setKeySet(keySet, this.currentKeyIndex, emitRatchetEvent);
  }

  async setKeySet(keySet: KeySet, keyIndex: number, emitRatchetEvent = false) {
    this.cryptoKeyRing[keyIndex % this.cryptoKeyRing.length] = keySet;
    if (emitRatchetEvent) {
      this.emit('keyRatcheted', keySet.material, keyIndex, this.participantId);
    }
  }

  async setCurrentKeyIndex(index: number) {
    this.currentKeyIndex = index % this.cryptoKeyRing.length;
    this.resetKeyStatus();
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
