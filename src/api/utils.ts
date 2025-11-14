import type { Mutex } from '@livekit/mutex';
import { SignalResponse } from '@livekit/protocol';
import { Result, ResultAsync, errAsync } from 'neverthrow';
import { ConnectionError } from '../room/errors';
import { toHttpUrl, toWebsocketUrl } from '../room/utils';

export function createRtcUrl(url: string, searchParams: URLSearchParams) {
  const urlObj = new URL(toWebsocketUrl(url));
  searchParams.forEach((value, key) => {
    urlObj.searchParams.set(key, value);
  });
  return appendUrlPath(urlObj, 'rtc');
}

export function createValidateUrl(rtcWsUrl: string) {
  const urlObj = new URL(toHttpUrl(rtcWsUrl));
  return appendUrlPath(urlObj, 'validate');
}

function ensureTrailingSlash(path: string) {
  return path.endsWith('/') ? path : `${path}/`;
}

function appendUrlPath(urlObj: URL, path: string) {
  urlObj.pathname = `${ensureTrailingSlash(urlObj.pathname)}${path}`;
  return urlObj.toString();
}

export function parseSignalResponse(value: ArrayBuffer | string) {
  if (typeof value === 'string') {
    return SignalResponse.fromJson(JSON.parse(value), { ignoreUnknownFields: true });
  } else if (value instanceof ArrayBuffer) {
    return SignalResponse.fromBinary(new Uint8Array(value));
  }
  throw new Error(`could not decode websocket message: ${typeof value}`);
}

export function getAbortReasonAsString(
  signal: AbortSignal | Error | unknown,
  defaultMessage = 'Unknown reason',
) {
  if (!(signal instanceof AbortSignal)) {
    return defaultMessage;
  }
  const reason = signal.reason;
  switch (typeof reason) {
    case 'string':
      return reason;
    case 'object':
      return reason instanceof Error ? reason.message : defaultMessage;
    default:
      return 'toString' in reason ? reason.toString() : defaultMessage;
  }
}

export function withTimeout<T, E extends Error>(
  ra: ResultAsyncLike<T, E>,
  ms: number,
): ResultAsync<T, E | ReturnType<typeof ConnectionError.timeout>> {
  const timeout = ResultAsync.fromPromise(
    new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(ConnectionError.timeout('Timeout'));
      }, ms),
    ),
    (e) => e as ReturnType<typeof ConnectionError.timeout>,
  );

  return raceResults([ra, timeout]);
}

export function withAbort<T, E extends Error>(
  ra: ResultAsyncLike<T, E>,
  signal: AbortSignal | undefined,
): ResultAsync<T, E | ReturnType<typeof ConnectionError.cancelled>> {
  if (signal?.aborted) {
    return errAsync(ConnectionError.cancelled('AbortSignal invoked'));
  }

  const abortResult = ResultAsync.fromPromise(
    new Promise<never>((_, reject) => {
      const onAbortHandler = () => {
        signal?.removeEventListener('abort', onAbortHandler);
        reject(ConnectionError.cancelled('AbortSignal invoked'));
      };
      signal?.addEventListener('abort', onAbortHandler);
    }),
    (e) => e as ReturnType<typeof ConnectionError.cancelled>,
  );

  return raceResults([ra, abortResult]);
}

export function withMutex<T, E extends Error>(
  fn: ResultAsyncLike<T, E>,
  mutex: Mutex,
): ResultAsync<T, E> {
  return ResultAsync.fromSafePromise(mutex.lock()).andThen((unlock) => withFinally(fn, unlock));
}

/**
 * Executes a callback after a ResultAsync completes, regardless of success or failure.
 * Similar to Promise.finally() but for ResultAsync.
 *
 * @param ra - The ResultAsync to execute
 * @param onFinally - Callback to run after completion (receives no arguments)
 * @returns A new ResultAsync with the same result, but runs onFinally first
 *
 * @example
 * ```ts
 * withFinally(
 *   someOperation(),
 *   () => cleanup()
 * )
 * ```
 */
export function withFinally<T, E extends Error>(
  ra: ResultAsyncLike<T, E>,
  onFinally: () => void | Promise<void>,
): ResultAsync<T, E> {
  return ResultAsync.fromPromise(
    (async () => {
      try {
        const result = await ra;
        return result.match(
          (value) => value,
          (error) => {
            throw error as Error;
          },
        );
      } catch (error) {
        await onFinally();
        throw error as Error;
      } finally {
        await onFinally();
      }
    })(),
    (e) => e as E,
  );
}

/**
 * Races multiple ResultAsync operations and returns whichever completes first.
 * If all fail, returns the error from the first one to reject.
 * API-compatible with Promise.race, supporting heterogeneous types.
 *
 * @param values - Array of ResultAsync operations to race (can have different types)
 * @returns A new ResultAsync with the result of whichever completes first
 *
 * @example
 * ```ts
 * // Race a connection attempt against a timeout
 * raceResults([
 *   connectToServer(), // ResultAsync<Connection, ConnectionError>
 *   delay(5000).andThen(() => errAsync(new TimeoutError())) // ResultAsync<never, TimeoutError>
 * ]) // ResultAsync<Connection, ConnectionError | TimeoutError>
 * ```
 */
export function raceResults<T extends readonly ResultAsyncLike<any, any>[]>(
  values: T,
): ResultAsync<
  T[number] extends ResultAsync<infer V, any> ? V : never,
  T[number] extends ResultAsync<any, infer E> ? E : never
> {
  type V = T[number] extends ResultAsync<infer Value, any> ? Value : never;
  type E = T[number] extends ResultAsync<any, infer Err> ? Err : never;

  const settledPromises = values.map(
    (ra): PromiseLike<V> =>
      ra.then((res) =>
        res.match(
          (v) => Promise.resolve(v),
          (err) => Promise.reject(err),
        ),
      ),
  );

  return ResultAsync.fromPromise(Promise.race(settledPromises), (e) => e as E);
}

export type ResultAsyncLike<T, E> = ResultAsync<T, E> | Promise<Result<T, E>>;
