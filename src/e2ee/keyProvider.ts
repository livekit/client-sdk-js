import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import type { KeyProviderCallbacks, KeyInfo } from './types';
import { deriveKeyFromString } from './utils';

export class BaseKeyProvider extends (EventEmitter as new () => TypedEmitter<KeyProviderCallbacks>) {
  private keyInfoMap: Map<string, KeyInfo>;

  constructor() {
    super();
    this.keyInfoMap = new Map();
  }

  onSetEncryptionKey(key: CryptoKey, participantId?: string, keyIndex?: number) {
    const keyInfo: KeyInfo = { key, participantId, keyIndex };
    this.keyInfoMap.set(`${participantId ?? 'shared'}-${keyIndex ?? 0}`, keyInfo);
    this.emit('setKey', keyInfo);
  }

  getKeys() {
    return Array.from(this.keyInfoMap.values());
  }
}

export class ExternalE2EEKeyProvider extends BaseKeyProvider {
  async setKey(key: string) {
    const derivedKey = await deriveKeyFromString(key);
    this.onSetEncryptionKey(derivedKey);
  }
}
