import type { DataTrackFrame } from '../frame';
import { BaseAsyncReader } from '../../../utils/base-async-reader';

type DataTrackSubscriptionReaderOptions = {
  /**
   * An AbortSignal that, if aborted, will terminate the currently active
   * stream iteration operation.
   *
   * Note that when using AbortSignal.timeout(...), the timeout applies across
   * the whole iteration operation, not just one individual chunk read.
   */
  signal?: AbortSignal;
};

export class DataTrackSubscriptionReader extends BaseAsyncReader<DataTrackFrame> {
  private stream: ReadableStream<DataTrackFrame>;

  constructor(stream: ReadableStream<DataTrackFrame>, options?: DataTrackSubscriptionReaderOptions) {
    super(options?.signal);
    this.stream = stream;
  }

  [Symbol.asyncIterator]() {
    const reader = this.stream.getReader();
    // Suppress unhandled rejection on reader.closed — errors are
    // already propagated through reader.read() to the consumer.
    reader.closed.catch(() => {});

    const signal = this.signal;

    const cleanup = () => {
      reader.releaseLock();
    };

    return {
      next: async (): Promise<IteratorResult<DataTrackFrame>> => {
        try {
          if (signal?.aborted) {
            throw signal.reason;
          }
          const result = await new Promise<ReadableStreamReadResult<DataTrackFrame>>(
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
            return { done: true, value: undefined as any };
          } else {
            return { done: false, value: result.value };
          }
        } catch (err) {
          cleanup();
          throw err;
        }
      },

      // note: `return` runs only for premature exits (e.g. `break` in `for await`), see:
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#errors_during_iteration
      async return(): Promise<IteratorResult<DataTrackFrame>> {
        await reader.cancel();
        cleanup();
        return { done: true, value: undefined };
      },
    };
  }
}
