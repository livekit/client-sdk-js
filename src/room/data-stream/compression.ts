/**
 * Compression helpers for data streams. The buffered deflate-raw variant ({@link deflateRawCompress})
 * is for the inline (single-packet) case where the payload is small and bounded;
 * {@link deflateRawCompressReadable} / {@link inflateRawTransform} serve the chunked (multi-packet)
 * `sendText`/`sendBytes`/`sendFile` paths, streaming the compressed bytes through without buffering
 * the whole payload.
 *
 * These operate on bytes (not strings) so a single set of helpers serves both text and byte streams;
 * the `TextEncoder`/`TextDecoder` boundary lives at the manager/reader edges.
 *
 * Note the asymmetry between the two platform-codec wrappers: the inflate side
 * ({@link inflateRawTransform}) is exposed as a `ReadableWritablePair` so it drops straight into the
 * receive-side `pipeThrough` chain, at the cost of one localized cast to bridge a DOM lib-type
 * mismatch (see that function). The compress side ({@link deflateRawCompressReadable}) is consumed as
 * a plain readable on the send path, so it drives `getWriter()`/`getReader()` directly and needs no
 * cast.
 *
 * @internal
 */

/**
 * Pipes a byte stream through `CompressionStream('deflate-raw')`, exposing the compressed output as
 * a readable — the compression counterpart of {@link inflateRawTransform}. Drives the source into the
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
 * A `deflate-raw` decompression transform (inverse of {@link deflateRawCompressReadable}): pipe a
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
