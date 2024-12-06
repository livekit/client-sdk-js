import type { DataStream_Chunk } from '@livekit/protocol';
import { bigIntToNumber } from './utils';

export class StreamReader<T extends DataStream_Chunk = DataStream_Chunk> extends ReadableStream<T> {
  totalChunkCount?: number;

  private _chunksReceived: Set<number>;

  handleChunkReceived(id: number) {
    this._chunksReceived = this._chunksReceived.add(id);
    const currentProgress = this.totalChunkCount
      ? this._chunksReceived.size / this.totalChunkCount
      : undefined;
    this.onProgress?.(currentProgress);
  }

  get chunksReceived() {
    return this._chunksReceived;
  }

  constructor(
    underlyingSource: UnderlyingDefaultSource<T>,
    strategy?: QueuingStrategy<T>,
    totalChunkCount?: number,
  ) {
    super(underlyingSource, strategy);
    this.totalChunkCount = totalChunkCount;
    this._chunksReceived = new Set();
  }

  [Symbol.asyncIterator]() {
    const reader: ReadableStreamDefaultReader<T> = super.getReader();

    return {
      next: async (): Promise<IteratorResult<T>> => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            return { done: true, value: undefined as any };
          } else {
            this.handleChunkReceived(bigIntToNumber(value.chunkIndex));
            return { done: false, value };
          }
        } catch (error) {
          // TODO handle errors
          return { done: true, value: undefined as any };
        }
      },

      return() {
        reader.releaseLock();
        return { done: true, value: undefined as any };
      },
    };
  }

  onProgress?: (progress: number | undefined) => void;

  async readAll(): Promise<Array<T>> {
    const chunks: Array<T> = [];
    for await (const chunk of this) {
      chunks.push(chunk);
    }
    return chunks;
  }
}
