import { afterEach, describe, expect, it } from 'vitest';
import { createDOMException, isDOMException } from './dom-exception';

const originalDOMException = (globalThis as { DOMException?: unknown }).DOMException;

afterEach(() => {
  (globalThis as { DOMException?: unknown }).DOMException = originalDOMException;
});

describe('dom-exception helpers', () => {
  it('creates a fallback error when DOMException is unavailable', () => {
    (globalThis as { DOMException?: unknown }).DOMException = undefined;

    const error = createDOMException('aborted', 'AbortError') as Error & { code?: number };
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AbortError');
    expect(error.message).toBe('aborted');
    expect(error.code).toBe(0);
  });

  it('still identifies fallback errors by name when DOMException is unavailable', () => {
    (globalThis as { DOMException?: unknown }).DOMException = undefined;

    const error = createDOMException('aborted', 'AbortError');
    expect(isDOMException(error, 'AbortError')).toBe(true);
    expect(isDOMException(error, 'TimeoutError')).toBe(false);
  });
});
