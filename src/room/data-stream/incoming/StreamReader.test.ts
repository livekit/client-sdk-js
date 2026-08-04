import { DataStream_Chunk, Encryption_Type } from '@livekit/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TextStreamInfo } from '../../types';
import { TextStreamReader } from './StreamReader';

describe('TextStreamReader', () => {
  const OriginalTextDecoder = globalThis.TextDecoder;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back when TextDecoder does not support fatal mode', async () => {
    const constructorArguments: Array<{ encoding?: string; options?: TextDecoderOptions }> = [];

    vi.stubGlobal(
      'TextDecoder',
      class extends OriginalTextDecoder {
        constructor(encoding?: string, options?: TextDecoderOptions) {
          constructorArguments.push({ encoding, options });

          if (options?.fatal) throw new TypeError('fatal flag not supported');

          super(encoding, options);
        }
      },
    );

    const info: TextStreamInfo = {
      id: 'stream-1',
      mimeType: 'text/plain',
      topic: 'test',
      timestamp: 0,
      encryptionType: Encryption_Type.NONE,
    };

    const text = 'This is a stream.';

    const textStream = new ReadableStream<DataStream_Chunk>({
      start(controller) {
        controller.enqueue(
          new DataStream_Chunk({
            streamId: info.id,
            chunkIndex: 0n,
            content: new TextEncoder().encode(text),
          }),
        );
        controller.close();
      },
    });

    const reader = new TextStreamReader(info, textStream);

    expect(await reader.readAll()).toBe(text);
    expect(constructorArguments).toEqual([
      { encoding: 'utf-8', options: { fatal: true } },
      { encoding: 'utf-8', options: undefined },
    ]);
  });
});
