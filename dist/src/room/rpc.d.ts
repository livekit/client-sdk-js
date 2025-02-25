import { RpcError as RpcError_Proto } from '@livekit/protocol';
/** Parameters for initiating an RPC call */
export interface PerformRpcParams {
    /** The `identity` of the destination participant */
    destinationIdentity: string;
    /** The method name to call */
    method: string;
    /** The method payload */
    payload: string;
    /** Timeout for receiving a response after initial connection (milliseconds). Default: 10000 */
    responseTimeout?: number;
}
/**
 * Data passed to method handler for incoming RPC invocations
 */
export interface RpcInvocationData {
    /**
     * The unique request ID. Will match at both sides of the call, useful for debugging or logging.
     */
    requestId: string;
    /**
     * The unique participant identity of the caller.
     */
    callerIdentity: string;
    /**
     * The payload of the request. User-definable format, typically JSON.
     */
    payload: string;
    /**
     * The maximum time the caller will wait for a response.
     */
    responseTimeout: number;
}
/**
 * Specialized error handling for RPC methods.
 *
 * Instances of this type, when thrown in a method handler, will have their `message`
 * serialized and sent across the wire. The sender will receive an equivalent error on the other side.
 *
 * Built-in types are included but developers may use any string, with a max length of 256 bytes.
 */
export declare class RpcError extends Error {
    static MAX_MESSAGE_BYTES: number;
    static MAX_DATA_BYTES: number;
    code: number;
    data?: string;
    /**
     * Creates an error object with the given code and message, plus an optional data payload.
     *
     * If thrown in an RPC method handler, the error will be sent back to the caller.
     *
     * Error codes 1001-1999 are reserved for built-in errors (see RpcError.ErrorCode for their meanings).
     */
    constructor(code: number, message: string, data?: string);
    /**
     * @internal
     */
    static fromProto(proto: RpcError_Proto): RpcError;
    /**
     * @internal
     */
    toProto(): RpcError_Proto;
    static ErrorCode: {
        readonly APPLICATION_ERROR: 1500;
        readonly CONNECTION_TIMEOUT: 1501;
        readonly RESPONSE_TIMEOUT: 1502;
        readonly RECIPIENT_DISCONNECTED: 1503;
        readonly RESPONSE_PAYLOAD_TOO_LARGE: 1504;
        readonly SEND_FAILED: 1505;
        readonly UNSUPPORTED_METHOD: 1400;
        readonly RECIPIENT_NOT_FOUND: 1401;
        readonly REQUEST_PAYLOAD_TOO_LARGE: 1402;
        readonly UNSUPPORTED_SERVER: 1403;
        readonly UNSUPPORTED_VERSION: 1404;
    };
    /**
     * @internal
     */
    static ErrorMessage: Record<keyof typeof RpcError.ErrorCode, string>;
    /**
     * Creates an error object from the code, with an auto-populated message.
     *
     * @internal
     */
    static builtIn(key: keyof typeof RpcError.ErrorCode, data?: string): RpcError;
}
export declare const MAX_PAYLOAD_BYTES = 15360;
/**
 * @internal
 */
export declare function byteLength(str: string): number;
/**
 * @internal
 */
export declare function truncateBytes(str: string, maxBytes: number): string;
//# sourceMappingURL=rpc.d.ts.map