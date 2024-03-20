import { EventEmitter } from 'events';
import type TypedEventEmitter from 'typed-emitter';
import { workerLogger } from '../../logger';
import { KeyHandlerEvent, type ParticipantKeyHandlerCallbacks } from '../events';
import type { KeyProviderOptions, KeySet } from '../types';
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

  private cryptoKeyRing: Array<KeySet | undefined>;

  private keyProviderOptions: KeyProviderOptions;

  private ratchetPromiseMap: Map<number, Promise<CryptoKey>>;

  private participantIdentity: string;

  private decryptionFailureCount = 0;

  private _hasValidKey: boolean = true;

  get hasValidKey() {
    return this._hasValidKey;
  }

  constructor(participantIdentity: string, keyProviderOptions: KeyProviderOptions) {
    super();
    this.currentKeyIndex = 0;
    if (keyProviderOptions.keyringSize < 1 || keyProviderOptions.keyringSize > 255) {
      throw new TypeError('Keyring size needs to be between 1 and 256');
    }
    this.cryptoKeyRing = new Array(keyProviderOptions.keyringSize).fill(undefined);
    this.keyProviderOptions = keyProviderOptions;
    this.ratchetPromiseMap = new Map();
    this.participantIdentity = participantIdentity;
    this.resetKeyStatus();
  }

  decryptionFailure() {
    if (this.keyProviderOptions.failureTolerance < 0) {
      return;
    }
    this.decryptionFailureCount += 1;

    if (this.decryptionFailureCount > this.keyProviderOptions.failureTolerance) {
      workerLogger.warn(`key for ${this.participantIdentity} is being marked as invalid`);
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
    const currentKeyIndex = keyIndex ?? this.getCurrentKeyIndex();

    const existingPromise = this.ratchetPromiseMap.get(currentKeyIndex);
    if (typeof existingPromise !== 'undefined') {
      return existingPromise;
    }
    const ratchetPromise = new Promise<CryptoKey>(async (resolve, reject) => {
      try {
        const keySet = this.getKeySet(currentKeyIndex);
        if (!keySet) {
          throw new TypeError(
            `Cannot ratchet key without a valid keyset of participant ${this.participantIdentity}`,
          );
        }
        const currentMaterial = keySet.material;
        const newMaterial = await importKey(
          await ratchet(currentMaterial, this.keyProviderOptions.ratchetSalt),
          currentMaterial.algorithm.name,
          'derive',
        );

        if (setKey) {
          this.setKeyFromMaterial(newMaterial, currentKeyIndex, true);
          this.emit(
            KeyHandlerEvent.KeyRatcheted,
            newMaterial,
            this.participantIdentity,
            currentKeyIndex,
          );
        }
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
   * and derives encryption keys from the material and sets it on the key ring buffers
   * together with the material
   * also updates the currentKeyIndex
   */
  async setKeyFromMaterial(material: CryptoKey, keyIndex: number, emitRatchetEvent = false) {
    const keySet = await deriveKeys(material, this.keyProviderOptions.ratchetSalt);
    const newIndex = keyIndex >= 0 ? keyIndex % this.cryptoKeyRing.length : this.currentKeyIndex;
    workerLogger.debug(`setting new key with index ${keyIndex}`, {
      usage: material.usages,
      algorithm: material.algorithm,
      ratchetSalt: this.keyProviderOptions.ratchetSalt,
    });
    this.setKeySet(keySet, newIndex, emitRatchetEvent);
    if (newIndex >= 0) this.currentKeyIndex = newIndex;
  }

  setKeySet(keySet: KeySet, keyIndex: number, emitRatchetEvent = false) {
    this.cryptoKeyRing[keyIndex % this.cryptoKeyRing.length] = keySet;

    if (emitRatchetEvent) {
      this.emit(KeyHandlerEvent.KeyRatcheted, keySet.material, this.participantIdentity, keyIndex);
    }
  }

  async setCurrentKeyIndex(index: number) {
    this.currentKeyIndex = index % this.cryptoKeyRing.length;
    this.resetKeyStatus();
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
