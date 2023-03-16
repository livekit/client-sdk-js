import { workerLogger } from '../../logger';
import { KEYRING_SIZE } from '../constants';
import type { KeySet, KeyProviderOptions } from '../types';
import { importKey, ratchet, deriveKeys } from '../utils';

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

  async ratchetKey(keyIndex?: number) {
    const currentMaterial = this.getKey(keyIndex).material;
    const newMaterial = await importKey(
      await ratchet(currentMaterial, this.keyProviderOptions.ratchetSalt),
      currentMaterial.algorithm.name,
      'derive',
    );

    this.setKeyFromMaterial(newMaterial, keyIndex ?? this.getCurrentKeyIndex());
  }

  async setKeyFromMaterial(material: CryptoKey, keyIndex = 0) {
    // if (key) {
    //   let newKey: CryptoKey;
    //   if (this.isSharedKey) {
    //     newKey = await crypto.subtle.importKey(
    //       'raw',
    //       key,
    //       {
    //         name: ENCRYPTION_ALGORITHM,
    //         length: 256,
    //       },
    //       false,
    //       ['encrypt', 'decrypt'],
    //     );
    //   } else {
    //     const material = await importKey(key);
    //     newKey = await deriveKeys(material);
    //   }
    workerLogger.debug('setting new key');
    if (keyIndex >= 0) {
      this.currentKeyIndex = keyIndex % this.cryptoKeyRing.length;
    }
    this.cryptoKeyRing[this.currentKeyIndex] = await deriveKeys(
      material,
      this.keyProviderOptions.ratchetSalt,
    );
    // }
  }

  isEnabled() {
    return this.enabled;
  }

  getCurrentKeyIndex() {
    return this.currentKeyIndex;
  }

  getKey(keyIndex?: number) {
    return this.cryptoKeyRing[keyIndex ?? this.currentKeyIndex];
  }
}
