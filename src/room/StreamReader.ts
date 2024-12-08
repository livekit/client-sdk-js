import type { DataStream_Chunk } from '@livekit/protocol';
import type { BaseStreamInfo, FileStreamInfo, TextStreamInfo } from './types';
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
 * A TextStreamReader instance can be used as an AsyncIterator that returns the entire string
 * that has been received up to the current point in time.
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
    this.receivedChunks.set(bigIntToNumber(chunk.chunkIndex), chunk);
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
   * returns an AsyncIterable<string> with the string being the entire string that has been received so far
   */
  [Symbol.asyncIterator]() {
    const reader = this.reader.getReader();
    const decoder = new TextDecoder();

    return {
      next: async (): Promise<IteratorResult<{ id: number; chunk: string; partial: string }>> => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            return { done: true, value: undefined };
          } else {
            this.handleChunkReceived(value);
            return {
              done: false,
              value: {
                id: bigIntToNumber(value.chunkIndex),
                chunk: decoder.decode(value.content),
                partial: Array.from(this.receivedChunks.values())
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

      return(): IteratorResult<{ id: number; chunk: string; partial: string }> {
        reader.releaseLock();
        return { done: true, value: undefined };
      },
    };
  }

  async readAll(): Promise<string> {
    let latestString: string = '';
    for await (const { partial } of this) {
      latestString = partial;
    }
    return latestString;
  }
}
