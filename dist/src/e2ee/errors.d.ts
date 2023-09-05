import { LivekitError } from '../room/errors';
export declare enum CryptorErrorReason {
    InvalidKey = 0,
    MissingKey = 1,
    InternalError = 2
}
export declare class CryptorError extends LivekitError {
    reason: CryptorErrorReason;
    constructor(message?: string, reason?: CryptorErrorReason);
}
//# sourceMappingURL=errors.d.ts.map