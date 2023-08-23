import { EventEmitter } from 'events';
import type TypedEventEmitter from 'typed-emitter';
import log from '../logger';
import { KEY_PROVIDER_DEFAULTS } from './constants';
import { type KeyProviderCallbacks, KeyProviderEvent } from './events';
import type { KeyInfo, KeyProviderOptions } from './types';
import { createKeyMaterialFromString } from './utils';

/**
 * @experimental
 */
export class BaseKeyProvider extends (EventEmitter as new () => TypedEventEmitter<KeyProviderCallbacks>) {
  private keyInfoMap: Map<string, KeyInfo>;

  private options: KeyProviderOptions;

  constructor(options: Partial<KeyProviderOptions> = {}) {
    super();
    this.keyInfoMap = new Map();
    this.options = { ...KEY_PROVIDER_DEFAULTS, ...options };
    this.on(KeyProviderEvent.KeyRatcheted, this.onKeyRatcheted);
  }

  /**
   * callback to invoke once a key has been set for a participant
   * @param key
   * @param participantId
   * @param keyIndex
   */
  protected onSetEncryptionKey(key: CryptoKey, participantId?: string, keyIndex?: number) {
    const keyInfo: KeyInfo = { key, participantId, keyIndex };
    this.keyInfoMap.set(`${participantId ?? 'shared'}-${keyIndex ?? 0}`, keyInfo);
    this.emit(KeyProviderEvent.SetKey, keyInfo);
  }

  /**
   * callback being invoked after a ratchet request has been performed on a participant
   * that surfaces the new key material.
   * @param material
   * @param keyIndex
   */
  protected onKeyRatcheted = (material: CryptoKey, keyIndex?: number) => {
    log.debug('key ratcheted event received', material, keyIndex);
  };

  getKeys() {
    return Array.from(this.keyInfoMap.values());
  }

  getOptions() {
    return this.options;
  }

  ratchetKey(participantId?: string, keyIndex?: number) {
    this.emit(KeyProviderEvent.RatchetRequest, participantId, keyIndex);
  }
}

/**
 * A basic KeyProvider implementation intended for a single shared
 * passphrase between all participants
 * @experimental
 */
export class ExternalE2EEKeyProvider extends BaseKeyProvider {
  ratchetInterval: number | undefined;

  constructor(options: Partial<Omit<KeyProviderOptions, 'sharedKey'>> = {}) {
    const opts: Partial<KeyProviderOptions> = {
      ...options,
      sharedKey: true,
      // for a shared key provider failing to decrypt for a specific participant
      // should not mark the key as invalid, so we accept wrong keys forever
      // and won't try to auto-ratchet
      ratchetWindowSize: 0,
      failureTolerance: -1,
    };
    super(opts);
  }

  /**
   * Accepts a passphrase that's used to create the crypto keys
   * @param key
   */
  async setKey(key: string) {
    const derivedKey = await createKeyMaterialFromString(key);
    this.onSetEncryptionKey(derivedKey);
  }
}
