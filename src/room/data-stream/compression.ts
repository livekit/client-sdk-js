/**
 * Compression helpers for data streams. The buffered deflate-raw variant ({@link deflateRawCompress})
 * is for the inline (single-packet) case where the payload is small and bounded;
 * {@link deflateRawTransform} / {@link inflateRawTransform} serve the chunked (multi-packet)
 * `sendText`/`sendBytes`/`sendFile` paths, streaming the bytes through without buffering the whole
 * payload.
 *
 * These operate on bytes (not strings) so a single set of helpers serves both text and byte streams;
 * the `TextEncoder`/`TextDecoder` boundary lives at the manager/reader edges.
 *
 * Both streaming variants are exposed as `ReadableWritablePair`s so they drop straight into a
 * `pipeThrough` chain. Each needs one localized cast to bridge a DOM lib-type mismatch: the platform
 * `CompressionStream`/`DecompressionStream` type their `writable` as `WritableStream<BufferSource>`
 * (a wider element type than `Uint8Array`), and `WritableStream<W>` is covariant in `W`, so neither
 * is structurally a `ReadableWritablePair<Uint8Array, Uint8Array>` without help.
 *
 * @internal
 */

/**
 * A `deflate-raw` compression transform (inverse of {@link inflateRawTransform}): pipe a byte stream
 * through it to get the compressed bytes without buffering the whole payload. Used for the chunked
 * `sendText`/`sendBytes`/`sendFile` paths, where the full payload is known up front but is streamed
 * (e.g. from `file.stream()`) rather than held in memory.
 */
export function deflateRawTransform(): ReadableWritablePair<Uint8Array, Uint8Array> {
  return new CompressionStream('deflate-raw') as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >;
}

/**
 * A `deflate-raw` decompression transform (inverse of {@link deflateRawTransform}): pipe a
 * stream of compressed bytes through it to get the decompressed bytes. Inflate emits output greedily,
 * so as long as the sender flushed at write boundaries each write's content is produced as soon as
 * its compressed bytes arrive.
 */
export function inflateRawTransform(): ReadableWritablePair<Uint8Array, Uint8Array> {
  return new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >;
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
