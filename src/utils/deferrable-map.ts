import { type Throws } from '@livekit/throws-transformer/throws';
import { Future } from '../room/utils';

/** An error which is thrown if a {@link DeferrableMap#getDeferred} call is aborted midway
 * through. */
export class DeferrableMapAbortError extends DOMException {
  reason: unknown;

  constructor(message: string, reason?: unknown) {
    super(message, 'AbortError');
    this.reason = reason;
  }
}

/**
 * A Map-like container keyed by unique strings that supports the ability to wait
 * for future keys to show up in the map.
 *
 * @example
 * // An already existing key:
 * const value = map.get("key");
 * // Wait for a key which will be added soon:
 * const value = await map.getDeferred("key");
 */
export class DeferrableMap<K, V> extends Map<K, V> {
  private pending: Map<K, Array<Future<V, DeferrableMapAbortError>>> = new Map();

  set(key: K, value: V): this {
    super.set(key, value);

    // Resolve any futures waiting on this key.
    const futures = this.pending?.get(key);
    if (futures) {
      for (const future of futures) {
        if (!future.isResolved) {
          future.resolve?.(value);
        }
      }
      this.pending.delete(key);
    }

    return this;
  }

  get [Symbol.toStringTag](): string {
    return 'DeferrableMap';
  }

  /**
   * Returns the value for `key` immediately if it exists, otherwise returns a
   * promise that resolves once `set(key, value)` is called.
   *
   * If an `AbortSignal` is provided and it is aborted before the key appears,
   * the returned promise rejects with an {@link DeferrableMapAbortError}.
   */
  getDeferred(key: K): Promise<V>;
  getDeferred(key: K, signal: AbortSignal): Promise<Throws<V, DeferrableMapAbortError>>;
  async getDeferred(key: K, signal?: AbortSignal) {
    const existing = this.get(key);
    if (typeof existing !== 'undefined') {
      return existing;
    }

    // Bail out immediately if the signal is already aborted.
    if (signal?.aborted) {
      throw new DeferrableMapAbortError('The operation was aborted.', signal.reason);
    }

    const future = new Future<V, DeferrableMapAbortError>(undefined, () => {
      // Clean up the pending list when the future settles.
      const futures = this.pending.get(key);
      if (!futures) {
        return;
      }

      const idx = futures.indexOf(future);
      if (idx !== -1) {
        futures.splice(idx, 1);
      }
      if (futures.length === 0) {
        this.pending.delete(key);
      }
    });

    const existingFutures = this.pending.get(key);
    if (existingFutures) {
      existingFutures.push(future);
    } else {
      this.pending.set(key, [future]);
    }

    // If a signal was provided, listen for abort and reject the future.
    if (signal) {
      const onAbort = () => {
        if (!future.isResolved) {
          future.reject?.(new DeferrableMapAbortError('The operation was aborted.', signal.reason));
        }
      };
      signal.addEventListener('abort', onAbort, { once: true });

      // Clean up the listener once the future settles (resolved or rejected).
      future.promise.finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    }

    return future.promise;
  }
}
