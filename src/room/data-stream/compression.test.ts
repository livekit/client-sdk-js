import { describe, expect, it } from 'vitest';
import {
  deflateRawCompress,
  deflateRawCompressStream,
  deflateRawDecompress,
  inflateRawStream,
} from './compression';

function bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function text(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

/** A readable stream that emits the given byte arrays in order. */
function streamOf(...parts: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

describe('data-stream buffered deflate-raw helpers (inline payloads)', () => {
  it('round-trips a buffered payload', async () => {
    const original = bytes('the quick brown fox '.repeat(500));
    const restored = await deflateRawDecompress(await deflateRawCompress(original));
    expect(text(restored)).toBe(text(original));
  });

  it('actually compresses repetitive data', async () => {
    const original = bytes('A'.repeat(50_000));
    const compressed = await deflateRawCompress(original);
    expect(compressed.byteLength).toBeLessThan(original.byteLength);
  });

  it('round-trips an empty payload', async () => {
    const restored = await deflateRawDecompress(await deflateRawCompress(new Uint8Array(0)));
    expect(restored.byteLength).toBe(0);
  });

  it('streams decompression of a one-shot payload split across many input chunks', async () => {
    const original = bytes('hello compressed world '.repeat(2_000));
    const compressed = await deflateRawCompress(original);

    // Feed the compressed bytes in small slices to exercise incremental decompression - a one-shot
    // buffer is also a valid input for the streaming decompressor.
    const slices: Uint8Array[] = [];
    for (let i = 0; i < compressed.byteLength; i += 100) {
      slices.push(compressed.slice(i, i + 100));
    }
    const restored = await collect(inflateRawStream(streamOf(...slices)));
    expect(text(restored)).toBe(text(original));
  });
});

describe('deflateRawCompressStream + inflateRawStream', () => {
  it('round-trips a one-shot payload through the streaming decompressor', async () => {
    const original = 'first part 日本語🚀 ' + 'repeated filler '.repeat(2_000);
    const compressed = await collect(deflateRawCompressStream(bytes(original)));
    const restored = await collect(inflateRawStream(streamOf(compressed)));
    expect(text(restored)).toBe(original);
  });

  it('actually compresses repetitive data', async () => {
    const original = bytes('the quick brown fox '.repeat(2_000));
    const compressed = await collect(deflateRawCompressStream(original));
    expect(compressed.byteLength).toBeLessThan(original.byteLength / 3);
  });

  it('round-trips incompressible input', async () => {
    const original = new Uint8Array(10_000);
    for (let i = 0; i < original.length; i += 1) {
      original[i] = Math.floor(Math.random() * 256);
    }
    const compressed = await collect(deflateRawCompressStream(original));
    const restored = await collect(inflateRawStream(streamOf(compressed)));
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('round-trips an empty payload', async () => {
    const compressed = await collect(deflateRawCompressStream(new Uint8Array(0)));
    const restored = await collect(inflateRawStream(streamOf(compressed)));
    expect(restored.byteLength).toBe(0);
  });
});
