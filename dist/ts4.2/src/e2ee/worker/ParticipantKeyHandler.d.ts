import type TypedEventEmitter from 'typed-emitter';
import type { ParticipantKeyHandlerCallbacks } from '../events';
import type { KeyProviderOptions, KeySet } from '../types';
declare const ParticipantKeyHandler_base: new () => TypedEventEmitter<ParticipantKeyHandlerCallbacks>;
/**
 * ParticipantKeyHandler is responsible for providing a cryptor instance with the
 * en-/decryption key of a participant. It assumes that all tracks of a specific participant
 * are encrypted with the same key.
 * Additionally it exposes a method to ratchet a key which can be used by the cryptor either automatically
 * if decryption fails or can be triggered manually on both sender and receiver side.
 *
 */
export declare class ParticipantKeyHandler extends ParticipantKeyHandler_base {
    private currentKeyIndex;
    private cryptoKeyRing;
    private keyProviderOptions;
    private ratchetPromiseMap;
    private participantIdentity;
    private decryptionFailureCount;
    private _hasValidKey;
    get hasValidKey(): boolean;
    constructor(participantIdentity: string, keyProviderOptions: KeyProviderOptions);
    decryptionFailure(): void;
    decryptionSuccess(): void;
    /**
     * Call this after user initiated ratchet or a new key has been set in order to make sure to mark potentially
     * invalid keys as valid again
     */
    resetKeyStatus(): void;
    /**
     * Ratchets the current key (or the one at keyIndex if provided) and
     * returns the ratcheted material
     * if `setKey` is true (default), it will also set the ratcheted key directly on the crypto key ring
     * @param keyIndex
     * @param setKey
     */
    ratchetKey(keyIndex?: number, setKey?: boolean): Promise<CryptoKey>;
    /**
     * takes in a key material with `deriveBits` and `deriveKey` set as key usages
     * and derives encryption keys from the material and sets it on the key ring buffer
     * together with the material
     * also resets the valid key property and updates the currentKeyIndex
     */
    setKey(material: CryptoKey, keyIndex?: number): Promise<void>;
    /**
     * takes in a key material with `deriveBits` and `deriveKey` set as key usages
     * and derives encryption keys from the material and sets it on the key ring buffers
     * together with the material
     * also updates the currentKeyIndex
     */
    setKeyFromMaterial(material: CryptoKey, keyIndex: number, emitRatchetEvent?: boolean): Promise<void>;
    setKeySet(keySet: KeySet, keyIndex: number, emitRatchetEvent?: boolean): void;
    setCurrentKeyIndex(index: number): Promise<void>;
    getCurrentKeyIndex(): number;
    /**
     * returns currently used KeySet or the one at `keyIndex` if provided
     * @param keyIndex
     * @returns
     */
    getKeySet(keyIndex?: number): KeySet | undefined;
}
export {};
//# sourceMappingURL=ParticipantKeyHandler.d.ts.map
