/**
 * gzip compression helpers for data streams, built on the platform `CompressionStream` /
 * `DecompressionStream`. The buffered variants are for the inline (single-packet) case where the
 * payload is small and bounded; {@link gzipDecompressStream} streams for the chunked (multi-packet)
 * case, consuming compressed input and producing decompressed output incrementally rather than
 * buffering it all.
 *
 * These operate on bytes (not strings) so a single set of helpers serves both text and byte streams;
 * the `TextEncoder`/`TextDecoder` boundary lives at the manager/reader edges.
 *
 * Like the rest of the SDK, these drive `getWriter()`/`getReader()` directly instead of
 * `pipeThrough`, which sidesteps the `CompressionStream` lib-type mismatches.
 *
 * @internal
 */

/** gzip-compresses a byte array in full. Use for inline payloads; prefer the streaming path for the
 *  chunked case. */
export async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data as NonSharedUint8Array);
  writer.close();
  return collect(cs.readable);
}

/** gunzips a byte array in full (inverse of {@link gzipCompress}). */
export async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(data as NonSharedUint8Array);
  writer.close();
  return collect(ds.readable);
}

/**
 * Streams a gzip-compressed byte stream through decompression, feeding compressed chunks into the
 * `DecompressionStream` as they arrive and exposing the decompressed output as a readable. Source
 * errors are forwarded by aborting the decompression input.
 */
export function gzipDecompressStream(
  input: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  // Drive compressed input into the decompressor in the background; the IIFE handles its own errors
  // by aborting the writable (which surfaces on the readable side), so this never rejects.
  const pipe = (async () => {
    const reader = input.getReader();
    try {
      for (;;) {
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
