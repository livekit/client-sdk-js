import type { DataStream_Chunk } from '@livekit/protocol';
import type { BaseStreamInfo, ByteStreamInfo, TextStreamInfo } from '../../types';
import { DataStreamError, DataStreamErrorReason } from '../../errors';
import { Future, bigIntToNumber } from '../../utils';

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

  constructor(info: T, stream: ReadableStream<DataStream_Chunk>, totalByteSize?: number) {
    this.reader = stream;
    this.totalByteSize = totalByteSize;
    this._info = info;
    this.bytesReceived = 0;
  }

  protected abstract handleChunkReceived(chunk: DataStream_Chunk): void;

  onProgress?: (progress: number | undefined) => void;

  abstract readAll(opts?: BaseStreamReaderReadAllOpts): Promise<string | Array<Uint8Array>>;
}

export class ByteStreamReader extends BaseStreamReader<ByteStreamInfo> {
  protected handleChunkReceived(chunk: DataStream_Chunk) {
    this.bytesReceived += chunk.content.byteLength;
    if (typeof this.totalByteSize === 'number' && this.bytesReceived > this.totalByteSize) {
      throw new DataStreamError(
        `Extra chunk(s) received - expected ${this.totalByteSize} bytes of data total, received ${this.bytesReceived} bytes`,
        DataStreamErrorReason.LengthExceeded,
      );
    }

    const currentProgress = this.totalByteSize
      ? this.bytesReceived / this.totalByteSize
      : undefined;
    this.onProgress?.(currentProgress);
  }

  onProgress?: (progress: number | undefined) => void;

  signal?: AbortSignal;

  [Symbol.asyncIterator]() {
    const reader = this.reader.getReader();

    let rejectingSignalFuture = new Future<never>();
    let activeSignal: AbortSignal | null = null;
    let onAbort: (() => void) | null = null;
    if (this.signal) {
      const signal = this.signal;
      onAbort = () => {
        rejectingSignalFuture.reject?.(signal.reason);
      };
      signal.addEventListener('abort', onAbort);
      activeSignal = signal;
    }

    const cleanup = () => {
      reader.releaseLock();

      if (activeSignal && onAbort) {
        activeSignal.removeEventListener('abort', onAbort);
      }

      this.signal = undefined;
    };

    return {
      next: async (): Promise<IteratorResult<Uint8Array>> => {
        try {
          const { done, value } = await Promise.race([
            reader.read(),
            rejectingSignalFuture.promise,
          ]);
          if (done) {
            return { done: true, value: undefined as any };
          } else {
            this.handleChunkReceived(value);
            return { done: false, value: value.content };
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
 * A class to read chunks from a ReadableStream and provide them in a structured format.
 */
export class TextStreamReader extends BaseStreamReader<TextStreamInfo> {
  private receivedChunks: Map<number, DataStream_Chunk>;

  signal?: AbortSignal;

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

    this.bytesReceived += chunk.content.byteLength;
    if (typeof this.totalByteSize === 'number' && this.bytesReceived > this.totalByteSize) {
      throw new DataStreamError(
        `Extra chunk(s) received - expected ${this.totalByteSize} bytes of data total, received ${this.bytesReceived} bytes`,
        DataStreamErrorReason.LengthExceeded,
      );
    }

    const currentProgress = this.totalByteSize
      ? this.bytesReceived / this.totalByteSize
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

    let rejectingSignalFuture = new Future<never>();
    let activeSignal: AbortSignal | null = null;
    let onAbort: (() => void) | null = null;
    if (this.signal) {
      const signal = this.signal;
      onAbort = () => {
        rejectingSignalFuture.reject?.(signal.reason);
      };
      signal.addEventListener('abort', onAbort);
      activeSignal = signal;
    }

    const cleanup = () => {
      reader.releaseLock();

      if (activeSignal && onAbort) {
        activeSignal.removeEventListener('abort', onAbort);
      }

      this.signal = undefined;
    };

    return {
      next: async (): Promise<IteratorResult<string>> => {
        try {
          const { done, value } = await Promise.race([
            reader.read(),
            rejectingSignalFuture.promise,
          ]);
          if (done) {
            return { done: true, value: undefined };
          } else {
            this.handleChunkReceived(value);

            let decodedResult;
            try {
              decodedResult = decoder.decode(value.content);
            } catch (err) {
              throw new DataStreamError(
                `Cannot decode datastream chunk ${value.chunkIndex} as text: ${err}`,
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
