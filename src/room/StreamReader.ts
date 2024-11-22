export class StreamReader<T> extends ReadableStream<T> {
  constructor(
    underlyingSource?: UnderlyingSource<T>,
    strategy?: QueuingStrategy<T>,
    totalChunkCount?: number,
  ) {
    super(underlyingSource, strategy);
  }

  [Symbol.asyncIterator]() {
    const reader = this.getReader();

    return {
      async next(): Promise<IteratorResult<T>> {
        try {
          const { done, value } = await reader.read();

          if (done) {
            return { done: true, value: undefined as any };
          } else {
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

  progress() {}

  async readAll(): Promise<Array<T>> {
    const chunks: Array<T> = [];
    for await (const chunk of this) {
      chunks.push(chunk);
    }
    return chunks;
  }
}
