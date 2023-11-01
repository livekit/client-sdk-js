export declare function isE2EESupported(): boolean;
export declare function isScriptTransformSupported(): boolean;
export declare function isInsertableStreamSupported(): boolean;
export declare function isVideoFrame(frame: RTCEncodedAudioFrame | RTCEncodedVideoFrame): frame is RTCEncodedVideoFrame;
export declare function importKey(keyBytes: Uint8Array | ArrayBuffer, algorithm?: string | {
    name: string;
}, usage?: 'derive' | 'encrypt'): Promise<CryptoKey>;
export declare function createKeyMaterialFromString(password: string): Promise<CryptoKey>;
export declare function createKeyMaterialFromBuffer(cryptoBuffer: ArrayBuffer): Promise<CryptoKey>;
/**
 * Derives a set of keys from the master key.
 * See https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.1
 */
export declare function deriveKeys(material: CryptoKey, salt: string): Promise<{
    material: CryptoKey;
    encryptionKey: CryptoKey;
}>;
export declare function createE2EEKey(): Uint8Array;
/**
 * Ratchets a key. See
 * https://tools.ietf.org/html/draft-omara-sframe-00#section-4.3.5.1
 */
export declare function ratchet(material: CryptoKey, salt: string): Promise<ArrayBuffer>;
export declare function needsRbspUnescaping(frameData: Uint8Array): boolean;
export declare function parseRbsp(stream: Uint8Array): Uint8Array;
export declare function writeRbsp(data_in: Uint8Array): Uint8Array;
//# sourceMappingURL=utils.d.ts.map