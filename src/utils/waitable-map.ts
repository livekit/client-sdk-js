import { Future } from '../room/utils';
import { type Throws } from './throws';

/** An error which is thrown if a {@link WaitableMap#waitUntilExists} call is aborted midway
 * through. */
export class WaitableMapAbortError extends DOMException {
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
 * const value = await map.waitUntilExists("key");
 */
export class WaitableMap<K, V> implements Iterable<[K, V]> {
  private inner: Map<K, V>;
  private pending: Map<K, Array<Future<V, Error>>> = new Map();

  constructor(entries?: Array<[K, V]> | null) {
    this.inner = new Map(entries);
  }

  get size(): number {
    return this.inner.size;
  }

  get(key: K): V | undefined {
    return this.inner.get(key);
  }

  set(key: K, value: V): this {
    this.inner.set(key, value);

    // Resolve any futures waiting on this key.
    const futures = this.pending.get(key);
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

  has(key: K): boolean {
    return this.inner.has(key);
  }

  delete(key: K): boolean {
    return this.inner.delete(key);
  }

  clear(): void {
    this.inner.clear();
  }

  keys(): MapIterator<K> {
    return this.inner.keys();
  }

  values(): MapIterator<V> {
    return this.inner.values();
  }

  entries(): MapIterator<[K, V]> {
    return this.inner.entries();
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    this.inner.forEach(callbackfn, thisArg);
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.inner[Symbol.iterator]();
  }

  get [Symbol.toStringTag](): string {
    return 'WaitableMap';
  }

  /**
   * Returns the value for `key` immediately if it exists, otherwise returns a
   * promise that resolves once `set(key, value)` is called.
   *
   * If an `AbortSignal` is provided and it is aborted before the key appears,
   * the returned promise rejects with an AbortError.
   */
  waitUntilExists(key: K): Promise<V>;
  waitUntilExists(key: K, signal: AbortSignal): Promise<Throws<V, WaitableMapAbortError>>;
  async waitUntilExists(key: K, signal?: AbortSignal) {
    const existing = this.inner.get(key);
    if (typeof existing !== 'undefined') {
      return existing;
    }

    // Bail out immediately if the signal is already aborted.
    if (signal?.aborted) {
      throw new WaitableMapAbortError('The operation was aborted.', signal.reason);
    }

    const future = new Future<V, Error>(undefined, () => {
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
          future.reject?.(new WaitableMapAbortError('The operation was aborted.', signal.reason));
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
