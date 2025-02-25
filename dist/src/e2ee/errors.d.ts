import { LivekitError } from '../room/errors';
export declare enum CryptorErrorReason {
    InvalidKey = 0,
    MissingKey = 1,
    InternalError = 2
}
export declare class CryptorError extends LivekitError {
    reason: CryptorErrorReason;
    participantIdentity?: string;
    constructor(message?: string, reason?: CryptorErrorReason, participantIdentity?: string);
}
//# sourceMappingURL=errors.d.ts.map