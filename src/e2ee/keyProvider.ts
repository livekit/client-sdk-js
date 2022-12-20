import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import type { KeyProviderCallbacks, KeyInfo } from './types';

export class BaseKeyProvider extends (EventEmitter as new () => TypedEmitter<KeyProviderCallbacks>) {
  private keyInfoMap: Map<string, KeyInfo>;

  constructor() {
    super();
    this.keyInfoMap = new Map();
  }

  onSetEncryptionKey(key: Uint8Array, participantId?: string, keyIndex?: number) {
    const keyInfo: KeyInfo = { key, participantId, keyIndex };
    this.keyInfoMap.set(`${participantId ?? 'shared'}-${keyIndex ?? 0}`, keyInfo);
    this.emit('setKey', keyInfo);
  }

  getKeys() {
    return Array.from(this.keyInfoMap.values());
  }
}

export class ExternalE2EEKeyProvider extends BaseKeyProvider {
  setKey(key: Uint8Array) {
    this.onSetEncryptionKey(key);
  }
}
