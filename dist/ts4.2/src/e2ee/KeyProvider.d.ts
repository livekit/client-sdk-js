import type TypedEventEmitter from 'typed-emitter';
import type { KeyProviderCallbacks } from './events';
import type { KeyInfo, KeyProviderOptions } from './types';
declare const BaseKeyProvider_base: new () => TypedEventEmitter<KeyProviderCallbacks>;
/**
 * @experimental
 */
export declare class BaseKeyProvider extends BaseKeyProvider_base {
    private keyInfoMap;
    private readonly options;
    constructor(options?: Partial<KeyProviderOptions>);
    /**
     * callback to invoke once a key has been set for a participant
     * @param key
     * @param participantIdentity
     * @param keyIndex
     */
    protected onSetEncryptionKey(key: CryptoKey, participantIdentity?: string, keyIndex?: number): void;
    /**
     * callback being invoked after a ratchet request has been performed on a participant
     * that surfaces the new key material.
     * @param material
     * @param keyIndex
     */
    protected onKeyRatcheted: (material: CryptoKey, keyIndex?: number) => void;
    getKeys(): KeyInfo[];
    getOptions(): KeyProviderOptions;
    ratchetKey(participantIdentity?: string, keyIndex?: number): void;
}
/**
 * A basic KeyProvider implementation intended for a single shared
 * passphrase between all participants
 * @experimental
 */
export declare class ExternalE2EEKeyProvider extends BaseKeyProvider {
    ratchetInterval: number | undefined;
    constructor(options?: Partial<Omit<KeyProviderOptions, 'sharedKey'>>);
    /**
     * Accepts a passphrase that's used to create the crypto keys.
     * When passing in a string, PBKDF2 is used.
     * When passing in an Array buffer of cryptographically random numbers, HKDF is being used. (recommended)
     * @param key
     */
    setKey(key: string | ArrayBuffer): Promise<void>;
}
export {};
//# sourceMappingURL=KeyProvider.d.ts.map
