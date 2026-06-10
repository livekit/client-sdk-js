/**
 * Compression helpers for data streams. The buffered deflate-raw variants are for the inline
 * (single-packet) case where the payload is small and bounded; {@link StreamingDeflate} /
 * {@link inflateRawStream} serve the chunked (multi-packet) case, producing/consuming compressed
 * data incrementally rather than buffering it all. {@link gzipCompressStream} remains for the
 * legacy chunked byte-stream scheme (one gzip member per write).
 *
 * These operate on bytes (not strings) so a single set of helpers serves both text and byte streams;
 * the `TextEncoder`/`TextDecoder` boundary lives at the manager/reader edges.
 *
 * Like the rest of the SDK, the platform-stream helpers drive `getWriter()`/`getReader()` directly
 * instead of `pipeThrough`, which sidesteps the `CompressionStream` lib-type mismatches.
 *
 * @internal
 */
import { Deflate } from 'fflate';

/**
 * Per-stream raw-deflate compressor for chunked data streams. One instance lives for the whole
 * stream, so the LZ77 window persists across writes — repeated content in later writes compresses
 * against earlier ones (the permessage-deflate "context takeover" model). Each
 * {@link StreamingDeflate.compressWrite} output is flushed to a byte boundary, so a receiver
 * feeding the bytes through a single raw-deflate decompressor can decode every write's content as
 * soon as it arrives, without waiting for the stream to end.
 *
 * Built on fflate rather than `CompressionStream` because the platform compressor has no flush —
 * it only emits buffered output on close, which would force a fresh (dictionary-reset) compressor
 * per write.
 */
export class StreamingDeflate {
  private pending: Array<Uint8Array> = [];

  private deflate = new Deflate((chunk) => {
    this.pending.push(chunk);
  });

  /** Compresses one write. The returned bytes are byte-aligned (sync flush), so the receiver can
   *  decompress the write's full content immediately upon receiving them. */
  compressWrite(data: Uint8Array): Uint8Array {
    this.deflate.push(data);
    this.deflate.flush();
    return this.takePending();
  }

  /** Terminates the deflate stream with an empty final block. Call exactly once, after the last
   *  write; the returned bytes must be delivered so the receiver's decompressor can close cleanly. */
  end(): Uint8Array {
    this.deflate.push(new Uint8Array(0), true);
    return this.takePending();
  }

  private takePending(): Uint8Array {
    if (this.pending.length === 1) {
      const only = this.pending[0];
      this.pending = [];
      return only;
    }
    const total = this.pending.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.pending) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.pending = [];
    return result;
  }
}

/**
 * Compresses a fully-known payload into a raw-deflate stream, exposing the compressed output as a
 * readable so callers can forward it incrementally. Produces the same wire format as
 * {@link StreamingDeflate} (a raw-deflate stream terminated by a final block) but via the platform
 * `CompressionStream` — usable only when the entire payload is written at once, since the platform
 * compressor cannot flush mid-stream (its only "flush" is the close at the end).
 */
export function deflateRawCompressStream(data: Uint8Array): ReadableStream<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data as NonSharedUint8Array);
  writer.close();
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

/**
 * gzip-compresses a byte array, exposing the compressed output as a readable stream so callers can
 * forward it incrementally instead of buffering the whole result. The input is written in full (the
 * caller already holds it), but the output is produced and consumed chunk by chunk.
 */
export function gzipCompressStream(data: Uint8Array): ReadableStream<Uint8Array> {
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(data as NonSharedUint8Array);
  writer.close();
  return cs.readable;
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
