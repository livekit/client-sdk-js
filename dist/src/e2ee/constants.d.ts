import type { KeyProviderOptions } from './types';
export declare const ENCRYPTION_ALGORITHM = "AES-GCM";
export declare const DECRYPTION_FAILURE_TOLERANCE = 10;
export declare const UNENCRYPTED_BYTES: {
    readonly key: 10;
    readonly delta: 3;
    readonly audio: 1;
    readonly empty: 0;
};
export declare const IV_LENGTH = 12;
export declare const E2EE_FLAG = "lk_e2ee";
export declare const SALT = "LKFrameEncryptionKey";
export declare const KEY_PROVIDER_DEFAULTS: KeyProviderOptions;
export declare const MAX_SIF_COUNT = 100;
export declare const MAX_SIF_DURATION = 2000;
//# sourceMappingURL=constants.d.ts.map