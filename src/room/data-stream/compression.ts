/**
 * Compression helpers for data streams. The buffered deflate-raw variant ({@link deflateRawCompress})
 * is for the inline (single-packet) case where the payload is small and bounded;
 * {@link deflateRawCompressReadable} / {@link inflateRawStream} serve the chunked (multi-packet)
 * `sendText`/`sendFile` paths, streaming the compressed bytes through without buffering the whole
 * payload.
 *
 * These operate on bytes (not strings) so a single set of helpers serves both text and byte streams;
 * the `TextEncoder`/`TextDecoder` boundary lives at the manager/reader edges.
 *
 * Like the rest of the SDK, the platform-stream helpers drive `getWriter()`/`getReader()` directly
 * instead of `pipeThrough`, which sidesteps the `CompressionStream` lib-type mismatches.
 *
 * @internal
 */

/**
 * Pipes a byte stream through `CompressionStream('deflate-raw')`, exposing the compressed output as
 * a readable — the compression counterpart of {@link inflateRawStream}. Drives the source into the
 * compressor in the background (forwarding source errors via `abort`), so callers can forward the
 * compressed output incrementally without buffering the whole payload. Used for the chunked
 * `sendText`/`sendFile` paths, where the full payload is known up front but is streamed (e.g. from
 * `file.stream()`) rather than held in memory.
 */
export function deflateRawCompressReadable(
  input: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  const pipe = (async () => {
    const reader = input.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await writer.write(value as NonSharedUint8Array);
      }
      await writer.close();
    } catch (err) {
      await writer.abort(err).catch(() => {});
    }
  })();
  pipe.catch(() => {});
  return cs.readable;
}

/**
 * Streams raw-deflate input through a single `DecompressionStream('deflate-raw')` for the lifetime
 * of the stream (inverse of {@link StreamingDeflate}). Inflate emits output greedily, so as long as
 * the sender flushed at write boundaries, each write's content is produced as soon as its
 * compressed bytes are written. Source errors are forwarded by aborting the decompression input.
 */
export function inflateRawStream(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  // Drive compressed input into the decompressor in the background; the IIFE handles its own errors
  // by aborting the writable (which surfaces on the readable side), so this never rejects.
  const pipe = (async () => {
    const reader = input.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await writer.write(value as NonSharedUint8Array);
      }
      await writer.close();
    } catch (err) {
      await writer.abort(err).catch(() => {});
    }
  })();
  pipe.catch(() => {});
  return ds.readable;
}

/** deflate-raw compresses a byte array in full. Use for inline payloads; prefer the streaming
 * path for the chunked case. */
export async function deflateRawCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data as NonSharedUint8Array);
  writer.close();
  return collect(cs.readable);
}

/** Decompresses a raw-deflate byte array in full (inverse of {@link deflateRawCompress}). */
export async function deflateRawDecompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data as NonSharedUint8Array);
  writer.close();
  return collect(ds.readable);
}

/** Concatenates all chunks of a byte stream into one array. */
async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
