import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import { KEY_PROVIDER_DEFAULTS } from './constants';
import type { KeyProviderCallbacks, KeyInfo, KeyProviderOptions } from './types';
import { createKeyMaterialFromString } from './utils';

export class BaseKeyProvider extends (EventEmitter as new () => TypedEmitter<KeyProviderCallbacks>) {
  private keyInfoMap: Map<string, KeyInfo>;

  private options: KeyProviderOptions;

  constructor(options: Partial<KeyProviderOptions> = {}) {
    super();
    this.keyInfoMap = new Map();
    this.options = { ...KEY_PROVIDER_DEFAULTS, ...options };
  }

  protected onSetEncryptionKey(key: CryptoKey, participantId?: string, keyIndex?: number) {
    const keyInfo: KeyInfo = { key, participantId, keyIndex };
    this.keyInfoMap.set(`${participantId ?? 'shared'}-${keyIndex ?? 0}`, keyInfo);
    this.emit('setKey', keyInfo);
  }

  getKeys() {
    return Array.from(this.keyInfoMap.values());
  }

  getOptions() {
    return this.options;
  }

  ratchetKey(participantId?: string) {
    this.emit('ratchetKey', participantId);
  }
}

export class ExternalE2EEKeyProvider extends BaseKeyProvider {
  ratchetInterval: number | undefined;

  constructor(options: Partial<KeyProviderOptions> = { sharedKey: true }) {
    super(options);
  }

  async setKey(key: string) {
    const derivedKey = await createKeyMaterialFromString(key);
    this.onSetEncryptionKey(derivedKey);
    // setTimeout(() => {
    //   clearInterval(this.ratchetInterval);
    //   this.ratchetInterval = setInterval(() => {
    //     this.ratchetKey();
    //   }, 5000) as unknown as number;
    // }, 5000);
  }
}
