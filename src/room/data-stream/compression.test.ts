import { describe, expect, it } from 'vitest';
import {
  StreamingDeflate,
  gzipCompress,
  gzipDecompress,
  gzipDecompressStream,
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

describe('StreamingDeflate + inflateRawStream', () => {
  it('round-trips multiple writes through a single decompressor', async () => {
    const deflate = new StreamingDeflate();
    const writes = ['first write ', 'second write with 日本語🚀 ', 'third '.repeat(100)];
    const parts = writes.map((w) => deflate.compressWrite(bytes(w)));
    parts.push(deflate.end());

    const restored = await collect(inflateRawStream(streamOf(...parts)));
    expect(text(restored)).toBe(writes.join(''));
  });

  it("emits each write's content before any further input arrives (timeliness)", async () => {
    const deflate = new StreamingDeflate();

    let inputController!: ReadableStreamDefaultController<Uint8Array>;
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        inputController = controller;
      },
    });
    const reader = inflateRawStream(input).getReader();
    const decoder = new TextDecoder();

    const writes = ['hello there, ', 'hello again - repeating myself, hello hello ', 'bye'];
    for (const write of writes) {
      inputController.enqueue(deflate.compressWrite(bytes(write)));
      // The write's full content must come out without sending anything further.
      let got = '';
      while (got.length < write.length) {
        const { done, value } = await reader.read();
        expect(done).toBe(false);
        got += decoder.decode(value!, { stream: true });
      }
      expect(got).toBe(write);
    }

    inputController.enqueue(deflate.end());
    inputController.close();
    const { done } = await reader.read();
    expect(done).toBe(true);
  });

  it('reuses the compression context across writes (later similar writes shrink)', () => {
    const deflate = new StreamingDeflate();
    const sentence = 'the quick brown fox jumps over the lazy dog and keeps on jumping. ';
    const first = deflate.compressWrite(bytes(sentence.repeat(10)));
    const second = deflate.compressWrite(bytes(sentence.repeat(10)));
    // The second write is pure back-references into the persisted window.
    expect(second.byteLength).toBeLessThan(first.byteLength / 4);
  });

  it('round-trips incompressible input', async () => {
    const deflate = new StreamingDeflate();
    const original = new Uint8Array(10_000);
    for (let i = 0; i < original.length; i += 1) {
      original[i] = Math.floor(Math.random() * 256);
    }
    const parts = [deflate.compressWrite(original), deflate.end()];
    const restored = await collect(inflateRawStream(streamOf(...parts)));
    expect(Array.from(restored)).toEqual(Array.from(original));
  });

  it('handles an empty write', async () => {
    const deflate = new StreamingDeflate();
    const parts = [
      deflate.compressWrite(bytes('before ')),
      deflate.compressWrite(new Uint8Array(0)),
      deflate.compressWrite(bytes('after')),
      deflate.end(),
    ];
    const restored = await collect(inflateRawStream(streamOf(...parts)));
    expect(text(restored)).toBe('before after');
  });
});
