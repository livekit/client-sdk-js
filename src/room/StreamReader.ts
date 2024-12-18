import type { DataStream_Chunk } from '@livekit/protocol';
import type { BaseStreamInfo, FileStreamInfo, TextStreamChunk, TextStreamInfo } from './types';
import { bigIntToNumber } from './utils';

abstract class BaseStreamReader<T extends BaseStreamInfo> {
  protected reader: ReadableStream<DataStream_Chunk>;

  protected totalChunkCount?: number;

  protected _info: T;

  get info() {
    return this._info;
  }

  constructor(info: T, stream: ReadableStream<DataStream_Chunk>, totalChunkCount?: number) {
    this.reader = stream;
    this.totalChunkCount = totalChunkCount;
    this._info = info;
  }

  protected abstract handleChunkReceived(chunk: DataStream_Chunk): void;

  onProgress?: (progress: number | undefined) => void;

  abstract readAll(): Promise<string | Array<Uint8Array>>;
}

export class BinaryStreamReader extends BaseStreamReader<FileStreamInfo> {
  private chunksReceived: Set<number>;

  constructor(
    info: FileStreamInfo,
    stream: ReadableStream<DataStream_Chunk>,
    totalChunkCount?: number,
  ) {
    super(info, stream, totalChunkCount);
    this.chunksReceived = new Set();
  }

  protected handleChunkReceived(chunk: DataStream_Chunk) {
    this.chunksReceived.add(bigIntToNumber(chunk.chunkIndex));
    const currentProgress = this.totalChunkCount
      ? this.chunksReceived.size / this.totalChunkCount
      : undefined;
    this.onProgress?.(currentProgress);
  }

  onProgress?: (progress: number | undefined) => void;

  [Symbol.asyncIterator]() {
    const reader = this.reader.getReader();

    return {
      next: async (): Promise<IteratorResult<Uint8Array>> => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            return { done: true, value: undefined as any };
          } else {
            this.handleChunkReceived(value);
            return { done: false, value: value.content };
          }
        } catch (error) {
          // TODO handle errors
          return { done: true, value: undefined };
        }
      },

      return(): IteratorResult<Uint8Array> {
        reader.releaseLock();
        return { done: true, value: undefined };
      },
    };
  }

  async readAll(): Promise<Array<Uint8Array>> {
    let chunks: Set<Uint8Array> = new Set();
    for await (const chunk of this) {
      chunks.add(chunk);
    }
    return Array.from(chunks);
  }
}

/**
 * A class to read chunks from a ReadableStream and provide them in a structured format.
 */
export class TextStreamReader extends BaseStreamReader<TextStreamInfo> {
  private receivedChunks: Map<number, DataStream_Chunk>;

  /**
   * A TextStreamReader instance can be used as an AsyncIterator that returns the entire string
   * that has been received up to the current point in time.
   */
  constructor(
    info: TextStreamInfo,
    stream: ReadableStream<DataStream_Chunk>,
    totalChunkCount?: number,
  ) {
    super(info, stream, totalChunkCount);
    this.receivedChunks = new Map();
  }

  protected handleChunkReceived(chunk: DataStream_Chunk) {
    const index = bigIntToNumber(chunk.chunkIndex);
    const previousChunkAtIndex = this.receivedChunks.get(index);
    if (previousChunkAtIndex && previousChunkAtIndex.version > chunk.version) {
      // we have a newer version already, dropping the old one
      return;
    }
    this.receivedChunks.set(index, chunk);
    const currentProgress = this.totalChunkCount
      ? this.receivedChunks.size / this.totalChunkCount
      : undefined;
    this.onProgress?.(currentProgress);
  }

  /**
   * @param progress - progress of the stream between 0 and 1. Undefined for streams of unknown size
   */
  onProgress?: (progress: number | undefined) => void;

  /**
   * Async iterator implementation to allow usage of `for await...of` syntax.
   * Yields structured chunks from the stream.
   *
   */
  [Symbol.asyncIterator]() {
    const reader = this.reader.getReader();
    const decoder = new TextDecoder();

    return {
      next: async (): Promise<IteratorResult<TextStreamChunk>> => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            return { done: true, value: undefined };
          } else {
            this.handleChunkReceived(value);
            return {
              done: false,
              value: {
                index: bigIntToNumber(value.chunkIndex),
                current: decoder.decode(value.content),
                collected: Array.from(this.receivedChunks.values())
                  .sort((a, b) => bigIntToNumber(a.chunkIndex) - bigIntToNumber(b.chunkIndex))
                  .map((chunk) => decoder.decode(chunk.content))
                  .join(''),
              },
            };
          }
        } catch (error) {
          // TODO handle errors
          return { done: true, value: undefined };
        }
      },

      return(): IteratorResult<TextStreamChunk> {
        reader.releaseLock();
        return { done: true, value: undefined };
      },
    };
  }

  async readAll(): Promise<string> {
    let latestString: string = '';
    for await (const { collected } of this) {
      latestString = collected;
    }
    return latestString;
  }
}
