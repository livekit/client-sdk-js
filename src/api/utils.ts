import type { Mutex } from '@livekit/mutex';
import { SignalResponse } from '@livekit/protocol';
import { Result, ResultAsync, errAsync } from 'neverthrow';
import { AbortError, TimeoutError } from '../room/errors';
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
  ra: ResultAsync<T, E> | Promise<Result<T, E>>,
  ms: number,
): ResultAsync<T, E | TimeoutError> {
  const toSettledPromise: PromiseLike<T> = ra.then((res) =>
    // `res` is a Result<T,E>; resolve with T or reject with E
    res.match(
      (v) => Promise.resolve(v),
      (err) => Promise.reject(err),
    ),
  );

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => {
      console.warn('timeout triggered');

      reject(new TimeoutError());
    }, ms),
  );

  return ResultAsync.fromPromise(
    // race returns a Promise<T> that resolves with T or rejects with E/onTimeout()
    Promise.race([toSettledPromise, timeout]),
    // map any thrown/rejected value into the error type E
    (e) => e as E | TimeoutError,
  );
}

export function withAbort<T, E extends Error>(
  ra: ResultAsync<T, E>,
  signal: AbortSignal | undefined,
): ResultAsync<T, E | AbortError> {
  if (signal?.aborted) {
    return errAsync(new AbortError());
  }

  const abortPromise = new Promise<never>((_, reject) => {
    const onAbortHandler = () => {
      signal?.removeEventListener('abort', onAbortHandler);
      reject(new AbortError());
    };
    signal?.addEventListener('abort', onAbortHandler);
  });

  const toSettledPromise: PromiseLike<T> = ra.then((res) =>
    res.match(
      (v) => Promise.resolve(v),
      (err) => Promise.reject(err),
    ),
  );

  return ResultAsync.fromPromise(
    Promise.race([toSettledPromise, abortPromise]),
    (e) => e as E | AbortError,
  );
}

export function withMutex<T, E extends Error>(
  fn: ResultAsync<T, E> | Result<T, E>,
  mutex: Mutex,
): ResultAsync<T, E> {
  return ResultAsync.fromPromise(
    (async () => {
      const unlock = await mutex.lock();
      try {
        const res = await fn;
        return res.match(
          (v) => v,
          (err) => {
            throw err as Error;
          },
        );
      } finally {
        unlock();
      }
    })(),
    (e) => e as E,
  );
}
