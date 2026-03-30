// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
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

  /**
   * Creates an error object with the given code and message, plus an optional data payload.
   *
   * If thrown in an RPC method handler, the error will be sent back to the caller.
   *
   * Error codes 1001-1999 are reserved for built-in errors (see RpcError.ErrorCode for their meanings).
   */
  constructor(code: number, message: string, data?: string) {
    super(message);
    this.code = code;
    this.message = truncateBytes(message, RpcError.MAX_MESSAGE_BYTES);
    this.data = data ? truncateBytes(data, RpcError.MAX_DATA_BYTES) : undefined;
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
  static builtIn(key: keyof typeof RpcError.ErrorCode, data?: string): RpcError {
    return new RpcError(RpcError.ErrorCode[key], RpcError.ErrorMessage[key], data);
  }
}

/*
 * Maximum payload size for RPC requests and responses for clients with a clientProtocol of less
 * than CLIENT_PROTOCOL_GZIP_RPC.
 *
 * If a payload exceeds this size and the remote client does not support compression,
 * the RPC call will fail with a REQUEST_PAYLOAD_TOO_LARGE(1402) or RESPONSE_PAYLOAD_TOO_LARGE(1504) error.
 */
export const MAX_LEGACY_PAYLOAD_BYTES = 15360; // 15 KB

/**
 * Attribute key set on a data stream to associate it with an RPC request.
 * @internal
 */
export const RPC_REQUEST_ID_ATTR = 'lk.rpc_request_id';

/** @internal */
export const RPC_REQUEST_METHOD_ATTR = 'lk.rpc_request_method';

/** @internal */
export const RPC_REQUEST_RESPONSE_TIMEOUT_MS_ATTR = 'lk.rpc_request_response_timeout_ms';

/**
 * Attribute key set on a data stream to associate it with an RPC response.
 * @internal
 */
export const RPC_RESPONSE_ID_ATTR = 'lk.rpc_response_id';

/**
 * Topic used for RPC payload data streams.
 * @internal
 */
export const RPC_DATA_STREAM_TOPIC = 'lk.rpc_payload';

/**
 * Compress a string payload using gzip.
 * @internal
 */
export async function gzipCompress(data: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(data);
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(input);
  writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Compress a string payload using gzip, streaming each compressed chunk to the provided writer.
 * @internal
 */
export async function gzipCompressToWriter(
  data: string,
  writer: { write(chunk: Uint8Array): Promise<void> },
): Promise<void> {
  const input = new TextEncoder().encode(data);
  const cs = new CompressionStream('gzip');
  const csWriter = cs.writable.getWriter();
  csWriter.write(input);
  csWriter.close();

  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    await writer.write(value);
  }
}

/**
 * Decompress a gzip-compressed payload back to a string.
 * @internal
 */
export async function gzipDecompress(data: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(data);
  writer.close();

  const reader = ds.readable.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

/**
 * Decompress a gzip-compressed stream of chunks back to a string, feeding each chunk
 * into the decompression stream as it arrives rather than buffering first.
 * @internal
 */
export async function gzipDecompressFromReader(reader: AsyncIterable<Uint8Array>): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const dsWriter = ds.writable.getWriter();

  // Feed compressed chunks into the decompression stream as they arrive
  const pipePromise = (async () => {
    for await (const chunk of reader) {
      await dsWriter.write(chunk);
    }
    await dsWriter.close();
  })();

  // Read decompressed output concurrently
  const dsReader = ds.readable.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await dsReader.read();
    if (done) {
      break;
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();

  await pipePromise;
  return result;
}

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
