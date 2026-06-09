import type { DataStream_Chunk } from '@livekit/protocol';
import { DataStreamError, DataStreamErrorReason } from '../../errors';
import type { BaseStreamInfo, ByteStreamInfo, TextStreamInfo } from '../../types';
import { bigIntToNumber, Future } from '../../utils';

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

  protected abstract handleChunkReceived(chunk: DataStream_Chunk): void;

  onProgress?: (progress: number | undefined) => void;

  abstract readAll(opts?: BaseStreamReaderReadAllOpts): Promise<string | Array<Uint8Array>>;
}

export class ByteStreamReader extends BaseStreamReader<ByteStreamInfo> {
  protected handleChunkReceived(chunk: DataStream_Chunk) {
    this.bytesReceived += chunk.content.byteLength;
    this.validateBytesReceived();

    const currentProgress = this.totalByteSize
      ? this.bytesReceived / this.totalByteSize
      : undefined;
    this.onProgress?.(currentProgress);
  }

  onProgress?: (progress: number | undefined) => void;

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
 * A class to read chunks from a ReadableStream and provide them in a structured format.
 */
export class TextStreamReader extends BaseStreamReader<TextStreamInfo> {
  /** Store a queue of chunks to be read. */
  private chunks: Array<DataStream_Chunk> = [];
  private chunkPublishedFuture = new Future<{ done: false, value: DataStream_Chunk } | { done: true, value?: undefined }, never>();
  private receivedChunks: Map<number /* chunk index */, DataStream_Chunk>;
  private receivedChunkDecompressionStreams: Map<number /* compression indexes */, {
    stream: DecompressionStream;
    writer: WritableStreamDefaultWriter<BufferSource>;
    reader: ReadableStreamDefaultReader<Uint8Array>;
  }> = new Map();


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

  /**
   * Async iterator implementation to allow usage of `for await...of` syntax.
   * Yields structured chunks from the stream.
   *
   */
  [Symbol.asyncIterator]() {
    const reader = this.reader.getReader();
    // Suppress unhandled rejection on reader.closed — errors are
    // already propagated through reader.read() to the consumer.
    reader.closed.catch(() => {});
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const signal = this.signal;

    const readNext = <T>(reader: ReadableStreamDefaultReader<T>, signal?: AbortSignal) => {
      return new Promise<ReadableStreamReadResult<T>>(
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
    };

    const decodeChunkContents = (content: Uint8Array, chunkIndex: bigint) => {
      let decodedResult;
      try {
        decodedResult = decoder.decode(content);
      } catch (err) {
        throw new DataStreamError(
          `Cannot decode datastream chunk ${chunkIndex} as text: ${err}`,
          DataStreamErrorReason.DecodeFailed,
        );
      }

      return decodedResult;
    };

    const cleanup = () => {
      reader.releaseLock();
      this.signal = undefined;
    };

    // Prefill DecompressionStreams ahead of the iterator for fastest decompression performance
    (async () => {
      let lastChunkIndex: bigint | null = null;
      while (true) {
        try {
          if (signal?.aborted) {
            throw signal.reason;
          }
          const result = await readNext(reader, signal);
          // console.log('RESULT', result);
          if (result.done) {
            this.chunkPublishedFuture.resolve?.({ done: true });
            break;
          } else {
            this.chunks.unshift(result.value);
            this.chunkPublishedFuture.resolve?.({ done: false, value: result.value });
            this.chunkPublishedFuture = new Future();

            const compressionIndex = result.value.iv?.[0] ?? 0;                 
            if (compressionIndex > 0) {                                         
              let state = this.receivedChunkDecompressionStreams.get(compressionIndex);
              if (!state) {
                const stream = new DecompressionStream('gzip');
                state = {
                  stream,
                  writer: stream.writable.getWriter(),
                  reader: stream.readable.getReader(),
                };
                this.receivedChunkDecompressionStreams.set(compressionIndex, state);
              }
              // console.log('WRITE CMP', compressionIndex, result.value.content);
              state.writer.write(result.value.content as BufferSource);
            }

            lastChunkIndex = result.value.chunkIndex;
          }
        } catch (err) {
          cleanup();
          throw err;
        }
      }
    })();

    return {
      next: async (): Promise<IteratorResult<string>> => {
        try {
          if (signal?.aborted) {
            throw signal.reason;
          }

          // Step 1: Get next chunk, either already pre-fetched in this.chunks, or if not then
          // wait for the next one to be generated
          let chunk = this.chunks.pop();
          if (!chunk) {
            const { done, value } = await this.chunkPublishedFuture.promise;
            if (done) {
              this.validateBytesReceived(true);
              return { done: true, value: undefined };
            }
            this.chunks.pop(); // FIXME: maybe do this in a loop?
            chunk = value;
          }
          // console.log('CHUNK', chunk);

          this.handleChunkReceived(chunk);

          let chunkContent = chunk.content;

          // Step 2: optionally decompress bu pulling the proper length in bytes from the
          // corresponding DecompressionStream
          const compressionIndex = chunk.iv?.[0] ?? 0;
          const uncompressedByteLength = (((chunk.iv?.[1] ?? 0) & 0xff) << 8) | ((chunk.iv?.[2] ?? 0) & 0xff);
          // console.log('COMPRESSION RATIO:', chunkContent.length / uncompressedByteLength);
          if (compressionIndex > 0) {
            // Chunk was compressed, so read the next `uncompressedByteLength` bytes
            const decompressionState = this.receivedChunkDecompressionStreams.get(compressionIndex);
            if (decompressionState) {
              let combinedBuffer = new Uint8Array(uncompressedByteLength);
              let offset = 0;
              while (true) {
                const { done, value } = await decompressionState.reader.read();
                // console.log('CMP READ:', done, value);
                if (done) {
                  break;
                }
                if (offset + value.length > combinedBuffer.length) {
                  throw new Error(`uncompressedByteLength value was too short, espected to be able to fit at least ${value.length} bytes at offset ${offset}, but only had ${combinedBuffer.length} bytes of space`);
                }
                combinedBuffer.set(value, offset);
                offset += value.length;
                if (offset >= combinedBuffer.length) {
                  // FIXME: store value.slice(offset - uncompressedByteLength) and return on next read
                  break;
                }
              }
              chunkContent = combinedBuffer;
            }
          }

          // Step 3: Decode raw result back into text
          // console.log('CNT', chunkContent);
          const decodedResult = decodeChunkContents(chunkContent, chunk.chunkIndex);
          // console.log('OUTPUT', decodedResult);

          return {
            done: false,
            value: decodedResult,
          };
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
