import type { ApiError } from '../clientReport';

export function recordExceptionAsync<T extends Object>(
  originalMethod: (...args: any) => Promise<any>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: ClassMethodDecoratorContext<T>,
) {
  if (_context.kind === 'method' && typeof originalMethod === 'function') {
    return function (this: any, ...args: any[]) {
      return originalMethod.call(this, ...args).catch(recordAndThrow);
    };
  } else {
    throw new TypeError('can only record exceptions on methods');
  }
}

export function recordException<T extends Object>(
  originalMethod: any,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _context: ClassMethodDecoratorContext<T>,
) {
  function replacementMethod(this: any, ...args: any[]) {
    try {
      return originalMethod.call(this, ...args);
    } catch (e) {
      recordAndThrow(e);
    }
  }
  return replacementMethod;
}

function recordAndThrow(e: any) {
  try {
    if (e instanceof Error) {
      recordedExceptions.push({
        timestamp: Date.now(),
        message: e.message,
        name: e.name,
        stackTrace: e.stack,
      });
    } else {
      recordedExceptions.push({
        timestamp: Date.now(),
        message: 'toString' in e ? e.toString() : `${e}`,
        name: 'UnknownError',
      });
    }
  } finally {
    throw e;
  }
}

const recordedExceptions = new Array<ApiError>();
