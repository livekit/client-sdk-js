export class StreamReader<T> extends ReadableStream<T> {
  totalChunkCount?: number;

  private _chunksReceived = 0;

  set chunksReceived(value: number) {
    this._chunksReceived = value;
    const currentProgress = this.totalChunkCount ? value / this.totalChunkCount : undefined;
    this.onProgress?.(currentProgress);
  }

  get chunksReceived() {
    return this._chunksReceived;
  }

  constructor(
    underlyingSource?: UnderlyingSource<T>,
    strategy?: QueuingStrategy<T>,
    totalChunkCount?: number,
  ) {
    super(underlyingSource, strategy);
    this.totalChunkCount = totalChunkCount;
    this._chunksReceived = 0;
  }

  [Symbol.asyncIterator]() {
    const reader = this.getReader();

    return {
      next: async (): Promise<IteratorResult<T>> => {
        try {
          const { done, value } = await reader.read();
          if (done) {
            return { done: true, value: undefined as any };
          } else {
            this.chunksReceived += 1;
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
