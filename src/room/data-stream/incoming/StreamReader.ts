import type { DataStream_Chunk } from '@livekit/protocol';
import { DataStreamError, DataStreamErrorReason } from '../../errors';
import type { BaseStreamInfo, ByteStreamInfo, TextStreamInfo } from '../../types';

export type BaseStreamReaderReadAllOpts = {
  /** An AbortSignal can be used to terminate reads early. */
  signal?: AbortSignal;
};

abstract class BaseStreamReader<T extends BaseStreamInfo> {
  protected reader: ReadableStream<DataStream_Chunk>;

  protected totalByteSize?: number;

  protected _info: T;

  protected bytesReceived: number;

  get info() {
    return this._info;
  }

  /** @internal */
  protected validateBytesReceived(doneReceiving: boolean = false) {
    if (typeof this.totalByteSize !== 'number' || this.totalByteSize === 0) {
      return;
    }

    if (doneReceiving && this.bytesReceived < this.totalByteSize) {
      throw new DataStreamError(
        `Not enough chunk(s) received - expected ${this.totalByteSize} bytes of data total, only received ${this.bytesReceived} bytes`,
        DataStreamErrorReason.Incomplete,
      );
    } else if (this.bytesReceived > this.totalByteSize) {
      throw new DataStreamError(
        `Extra chunk(s) received - expected ${this.totalByteSize} bytes of data total, received ${this.bytesReceived} bytes`,
        DataStreamErrorReason.LengthExceeded,
      );
    }
  }

  constructor(info: T, stream: ReadableStream<DataStream_Chunk>, totalByteSize?: number) {
    this.reader = stream;
    this.totalByteSize = totalByteSize;
    this._info = info;
    this.bytesReceived = 0;
  }

  /**
   * Counts a chunk's bytes against `totalByteSize` and reports progress. Chunk ordering and
   * de-duplication happen upstream in the manager's `ensureOrderedChunks`, so every chunk reaching
   * here is new and in order.
   */
  protected handleChunkReceived(chunk: DataStream_Chunk) {
    this.bytesReceived += chunk.content.byteLength;
    this.validateBytesReceived();

    const currentProgress = this.totalByteSize
      ? this.bytesReceived / this.totalByteSize
      : undefined;
    this.onProgress?.(currentProgress);
  }

  /**
   * @param progress - progress of the stream between 0 and 1. Undefined for streams of unknown size
   */
  onProgress?: (progress: number | undefined) => void;

  abstract readAll(opts?: BaseStreamReaderReadAllOpts): Promise<string | Array<Uint8Array>>;
}

export class ByteStreamReader extends BaseStreamReader<ByteStreamInfo> {
  signal?: AbortSignal;

  [Symbol.asyncIterator]() {
    const reader = this.reader.getReader();
    // Suppress unhandled rejection on reader.closed — errors are
    // already propagated through reader.read() to the consumer.
    reader.closed.catch(() => {});

    const cleanup = () => {
      reader.releaseLock();
      this.signal = undefined;
    };

    return {
      next: async (): Promise<IteratorResult<Uint8Array>> => {
        try {
          const signal = this.signal;
          if (signal?.aborted) {
            throw signal.reason;
          }
          const result = await new Promise<ReadableStreamReadResult<DataStream_Chunk>>(
            (resolve, reject) => {
              if (signal) {
                const onAbort = () => reject(signal.reason);
                signal.addEventListener('abort', onAbort, { once: true });
                reader
                  .read()
                  .then(resolve, reject)
                  .finally(() => {
                    signal.removeEventListener('abort', onAbort);
                  });
              } else {
                reader.read().then(resolve, reject);
              }
            },
          );
          if (result.done) {
            this.validateBytesReceived(true);
            if (typeof this.totalByteSize === 'number') {
              this.onProgress?.(1);
            }
            return { done: true, value: undefined as any };
          } else {
            this.handleChunkReceived(result.value);
            return { done: false, value: result.value.content };
          }
        } catch (err) {
          cleanup();
          throw err;
        }
      },

      // note: `return` runs only for premature exits, see:
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#errors_during_iteration
      async return(): Promise<IteratorResult<Uint8Array>> {
        cleanup();
        return { done: true, value: undefined };
      },
    };
  }

  /**
   * Injects an AbortSignal, which if aborted, will terminate the currently active
   * stream iteration operation.
   *
   * Note that when using AbortSignal.timeout(...), the timeout applies across
   * the whole iteration operation, not just one individual chunk read.
   */
  withAbortSignal(signal: AbortSignal) {
    this.signal = signal;
    return this;
  }

  async readAll(opts: BaseStreamReaderReadAllOpts = {}): Promise<Array<Uint8Array>> {
    let chunks: Set<Uint8Array> = new Set();
    const iterator = opts.signal ? this.withAbortSignal(opts.signal) : this;
    for await (const chunk of iterator) {
      chunks.add(chunk);
    }
    return Array.from(chunks);
  }
}

/**
 * A class to read chunks from a ReadableStream and decode them as UTF-8 text.
 *
 * NOTE: chunk-level `version` (resending a chunk at an already-received `chunkIndex` to supersede
 * it) is not supported. The reader used to rebuild the whole string from a per-index chunk map and
 * yield it as `TextStreamChunk.collected`, which made superseding work; 5d4a6346 (#1410, text auto
 * chunking) changed the iterator to yield each chunk's text as it arrives, and a streaming reader
 * cannot retract text it has already handed to the consumer. No sender emits a versioned chunk.
 */
export class TextStreamReader extends BaseStreamReader<TextStreamInfo> {
  signal?: AbortSignal;

  /**
   * Async iterator implementation to allow usage of `for await...of` syntax.
   * Yields each chunk's decoded text as it arrives - a delta, not the string accumulated so far.
   */
  [Symbol.asyncIterator]() {
    const reader = this.reader.getReader();
    // Suppress unhandled rejection on reader.closed — errors are
    // already propagated through reader.read() to the consumer.
    reader.closed.catch(() => {});
    const decoder = new TextDecoder('utf-8');
    const signal = this.signal;

    const cleanup = () => {
      reader.releaseLock();
      this.signal = undefined;
    };

    return {
      next: async (): Promise<IteratorResult<string>> => {
        try {
          if (signal?.aborted) {
            throw signal.reason;
          }
          const result = await new Promise<ReadableStreamReadResult<DataStream_Chunk>>(
            (resolve, reject) => {
              if (signal) {
                const onAbort = () => reject(signal.reason);
                signal.addEventListener('abort', onAbort, { once: true });
                reader
                  .read()
                  .then(resolve, reject)
                  .finally(() => {
                    signal.removeEventListener('abort', onAbort);
                  });
              } else {
                reader.read().then(resolve, reject);
              }
            },
          );
          if (result.done) {
            this.validateBytesReceived(true);
            if (typeof this.totalByteSize === 'number') {
              this.onProgress?.(1);
            }
            return { done: true, value: undefined };
          } else {
            this.handleChunkReceived(result.value);

            let decodedResult: string;
            try {
              decodedResult = decoder.decode(result.value.content);
            } catch (err) {
              throw new DataStreamError(
                `Cannot decode datastream chunk ${result.value.chunkIndex} as text: ${err}`,
                DataStreamErrorReason.DecodeFailed,
              );
            }

            return {
              done: false,
              value: decodedResult,
            };
          }
        } catch (err) {
          cleanup();
          throw err;
        }
      },

      // note: `return` runs only for premature exits, see:
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#errors_during_iteration
      async return(): Promise<IteratorResult<string>> {
        cleanup();
        return { done: true, value: undefined };
      },
    };
  }

  /**
   * Injects an AbortSignal, which if aborted, will terminate the currently active
   * stream iteration operation.
   *
   * Note that when using AbortSignal.timeout(...), the timeout applies across
   * the whole iteration operation, not just one individual chunk read.
   */
  withAbortSignal(signal: AbortSignal) {
    this.signal = signal;
    return this;
  }

  async readAll(opts: BaseStreamReaderReadAllOpts = {}): Promise<string> {
    let finalString: string = '';
    const iterator = opts.signal ? this.withAbortSignal(opts.signal) : this;
    for await (const chunk of iterator) {
      finalString += chunk;
    }
    return finalString;
  }
}

export type ByteStreamHandler = (
  reader: ByteStreamReader,
  participantInfo: { identity: string },
) => void;

export type TextStreamHandler = (
  reader: TextStreamReader,
  participantInfo: { identity: string },
) => void;
