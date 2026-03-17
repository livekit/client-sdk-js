/**
 * Abstract base class for LiveKit stream readers.
 *
 * Both data track readers and data stream readers extend this class.
 * This is intentional — both subsystems expose the same consumption pattern:
 * an async iterable that can be used with `for await...of`, with abort signal
 * support for cancellation.
 *
 * @typeParam T - The type of values yielded by the reader.
 */
export abstract class BaseAsyncReader<T> implements AsyncIterable<T> {
  protected signal?: AbortSignal;

  /** @internal */
  constructor(signal?: AbortSignal) {
    this.signal = signal;
  }

  abstract [Symbol.asyncIterator](): AsyncIterator<T>;
}
