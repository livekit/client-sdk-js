export declare class LivekitError extends Error {
    code: number;
    constructor(code: number, message?: string);
}
export declare const enum ConnectionErrorReason {
    NotAllowed = 0,
    ServerUnreachable = 1,
    InternalError = 2,
    Cancelled = 3,
    LeaveRequest = 4
}
export declare class ConnectionError extends LivekitError {
    status?: number;
    reason?: ConnectionErrorReason;
    constructor(message?: string, reason?: ConnectionErrorReason, status?: number);
}
export declare class DeviceUnsupportedError extends LivekitError {
    constructor(message?: string);
}
export declare class TrackInvalidError extends LivekitError {
    constructor(message?: string);
}
export declare class UnsupportedServer extends LivekitError {
    constructor(message?: string);
}
export declare class UnexpectedConnectionState extends LivekitError {
    constructor(message?: string);
}
export declare class NegotiationError extends LivekitError {
    constructor(message?: string);
}
export declare class PublishDataError extends LivekitError {
    constructor(message?: string);
}
export declare enum MediaDeviceFailure {
    PermissionDenied = "PermissionDenied",
    NotFound = "NotFound",
    DeviceInUse = "DeviceInUse",
    Other = "Other"
}
export declare namespace MediaDeviceFailure {
    function getFailure(error: any): MediaDeviceFailure | undefined;
}
//# sourceMappingURL=errors.d.ts.map