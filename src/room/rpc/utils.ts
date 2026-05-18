import { RpcError as RpcError_Proto } from '@livekit/protocol';

/** Parameters for initiating an RPC call */
export interface PerformRpcParams {
  /** The `identity` of the destination participant */
  destinationIdentity: string;
  /** The method name to call */
  method: string;
  /** The method payload */
  payload: string;
  /**
   * Timeout for receiving a response after the initial connection (milliseconds).
   * If a value less than 8000ms is provided, it will be automatically clamped to 8000ms
   * to ensure sufficient time for round-trip latency buffering.
   * Default: 15000ms.
   */
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

export class RpcError extends Error {
  static MAX_MESSAGE_BYTES = 256;

  static MAX_DATA_BYTES = 15360; // 15 KB

  code: number;

  data?: string;

  // More info: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/cause
  cause?: unknown;

  /**
   * Creates an error object with the given code and message, plus an optional data payload.
   *
   * If thrown in an RPC method handler, the error will be sent back to the caller.
   *
   * Error codes 1001-1999 are reserved for built-in errors (see RpcError.ErrorCode for their meanings).
   */
  constructor(code: number, message: string, data?: string, options?: { cause?: unknown }) {
    super(message);
    this.code = code;
    this.message = truncateBytes(message, RpcError.MAX_MESSAGE_BYTES);
    this.data = data ? truncateBytes(data, RpcError.MAX_DATA_BYTES) : undefined;

    if (typeof options?.cause !== 'undefined') {
      this.cause = options?.cause;
    }
  }

  /**
   * @internal
   */
  static fromProto(proto: RpcError_Proto) {
    return new RpcError(proto.code, proto.message, proto.data);
  }

  /**
   * @internal
   */
  toProto() {
    return new RpcError_Proto({
      code: this.code as number,
      message: this.message,
      data: this.data,
    });
  }

  static ErrorCode = {
    APPLICATION_ERROR: 1500,
    CONNECTION_TIMEOUT: 1501,
    RESPONSE_TIMEOUT: 1502,
    RECIPIENT_DISCONNECTED: 1503,
    RESPONSE_PAYLOAD_TOO_LARGE: 1504,
    SEND_FAILED: 1505,

    UNSUPPORTED_METHOD: 1400,
    RECIPIENT_NOT_FOUND: 1401,
    REQUEST_PAYLOAD_TOO_LARGE: 1402,
    UNSUPPORTED_SERVER: 1403,
    UNSUPPORTED_VERSION: 1404,
  } as const;

  /**
   * @internal
   */
  static ErrorMessage: Record<keyof typeof RpcError.ErrorCode, string> = {
    APPLICATION_ERROR: 'Application error in method handler',
    CONNECTION_TIMEOUT: 'Connection timeout',
    RESPONSE_TIMEOUT: 'Response timeout',
    RECIPIENT_DISCONNECTED: 'Recipient disconnected',
    RESPONSE_PAYLOAD_TOO_LARGE: 'Response payload too large',
    SEND_FAILED: 'Failed to send',

    UNSUPPORTED_METHOD: 'Method not supported at destination',
    RECIPIENT_NOT_FOUND: 'Recipient not found',
    REQUEST_PAYLOAD_TOO_LARGE: 'Request payload too large',
    UNSUPPORTED_SERVER: 'RPC not supported by server',
    UNSUPPORTED_VERSION: 'Unsupported RPC version',
  } as const;

  /**
   * Creates an error object from the code, with an auto-populated message.
   *
   * @internal
   */
  static builtIn(
    key: keyof typeof RpcError.ErrorCode,
    data?: string,
    options?: { cause?: unknown },
  ): RpcError {
    return new RpcError(RpcError.ErrorCode[key], RpcError.ErrorMessage[key], data, options);
  }
}

/*
 * Maximum payload size for RPC requests and responses for clients with a clientProtocol of less
 * than CLIENT_PROTOCOL_DATA_STREAM_RPC.
 *
 * If a payload exceeds this size and the remote client does not support compression,
 * the RPC call will fail with a REQUEST_PAYLOAD_TOO_LARGE(1402) or RESPONSE_PAYLOAD_TOO_LARGE(1504) error.
 */
export const MAX_V1_PAYLOAD_BYTES = 15360; // 15 KB

/**
 * Topic used for v2 RPC request data streams.
 * @internal
 */
export const RPC_REQUEST_DATA_STREAM_TOPIC = 'lk.rpc_request';

/**
 * Topic used for v2 RPC response data streams.
 * @internal
 */
export const RPC_RESPONSE_DATA_STREAM_TOPIC = 'lk.rpc_response';

/** @internal */
export enum RpcRequestAttrs {
  RPC_REQUEST_ID = 'lk.rpc_request_id',
  RPC_REQUEST_METHOD = 'lk.rpc_request_method',
  RPC_REQUEST_RESPONSE_TIMEOUT_MS = 'lk.rpc_request_response_timeout_ms',
  RPC_REQUEST_VERSION = 'lk.rpc_request_version',
}

/** Initial version of rpc which uses RpcRequest / RpcResponse messages.
 * @internal
 **/
export const RPC_VERSION_V1 = 1;

/** Rpc version backed by data streams instead of RpcRequest / RpcResponse.
 * @internal
 **/
export const RPC_VERSION_V2 = 2;

/**
 * @internal
 */
export function byteLength(str: string): number {
  const encoder = new TextEncoder();
  return encoder.encode(str).length;
}

/**
 * @internal
 */
export function truncateBytes(str: string, maxBytes: number): string {
  if (byteLength(str) <= maxBytes) {
    return str;
  }

  let low = 0;
  let high = str.length;
  const encoder = new TextEncoder();

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (encoder.encode(str.slice(0, mid)).length <= maxBytes) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return str.slice(0, low);
}
