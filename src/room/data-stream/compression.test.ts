import { describe, expect, it } from 'vitest';
import { gzipCompress, gzipDecompress, gzipDecompressStream } from './compression';

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

describe('data-stream gzip helpers', () => {
  it('round-trips a buffered payload', async () => {
    const original = bytes('the quick brown fox '.repeat(500));
    const restored = await gzipDecompress(await gzipCompress(original));
    expect(text(restored)).toBe(text(original));
  });

  it('actually compresses repetitive data', async () => {
    const original = bytes('A'.repeat(50_000));
    const compressed = await gzipCompress(original);
    expect(compressed.byteLength).toBeLessThan(original.byteLength);
  });

  it('round-trips an empty payload', async () => {
    const restored = await gzipDecompress(await gzipCompress(new Uint8Array(0)));
    expect(restored.byteLength).toBe(0);
  });

  it('streams decompression of a payload split across many compressed input chunks', async () => {
    const original = bytes('hello compressed world '.repeat(2_000));
    const compressed = await gzipCompress(original);

    // Feed the compressed bytes in small slices to exercise incremental decompression.
    const slices: Uint8Array[] = [];
    for (let i = 0; i < compressed.byteLength; i += 100) {
      slices.push(compressed.slice(i, i + 100));
    }
    const restored = await collect(gzipDecompressStream(streamOf(...slices)));
    expect(text(restored)).toBe(text(original));
  });
});
