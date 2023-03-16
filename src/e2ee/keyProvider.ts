import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import { SALT } from './constants';
import type { KeyProviderCallbacks, KeyInfo, KeyProviderOptions } from './types';
import { deriveKeyFromString, deriveKeyMaterialFromString } from './utils';

const keyProviderDefaults: KeyProviderOptions = {
  sharedKey: false,
  autoRatchet: true,
  ratchetSalt: SALT,
  ratchetWindowSize: 8,
};

export class BaseKeyProvider extends (EventEmitter as new () => TypedEmitter<KeyProviderCallbacks>) {
  private keyInfoMap: Map<string, KeyInfo>;

  private options: KeyProviderOptions;

  constructor(options: Partial<KeyProviderOptions> = {}) {
    super();
    this.keyInfoMap = new Map();
    this.options = { ...keyProviderDefaults, ...options };
  }

  onSetEncryptionKey(key: CryptoKey, participantId?: string, keyIndex?: number) {
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
}

export class ExternalE2EEKeyProvider extends BaseKeyProvider {
  constructor(options: Partial<KeyProviderOptions> = { sharedKey: true }) {
    super(options);
  }

  async setKey(key: string) {
    const derivedKey = await deriveKeyMaterialFromString(key);
    this.onSetEncryptionKey(derivedKey);
  }
}
