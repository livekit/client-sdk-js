type DOMExceptionCtor = new (message?: string, name?: string) => Error;

function getDOMExceptionCtor(): DOMExceptionCtor | undefined {
  const maybeCtor = (globalThis as { DOMException?: unknown }).DOMException;
  return typeof maybeCtor === 'function' ? (maybeCtor as DOMExceptionCtor) : undefined;
}

export function createDOMException(message: string, name: string): Error {
  const DOMExceptionClass = getDOMExceptionCtor();
  if (DOMExceptionClass) {
    return new DOMExceptionClass(message, name);
  }

  const fallbackError = new Error(message) as Error & { code?: number };
  fallbackError.name = name;
  fallbackError.code = 0;
  return fallbackError;
}

export function isDOMException(error: unknown, name?: string): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  if (name && error.name !== name) {
    return false;
  }

  const DOMExceptionClass = getDOMExceptionCtor();
  if (!DOMExceptionClass) {
    return true;
  }

  return error instanceof DOMExceptionClass;
}
