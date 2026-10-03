import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorRateLimiter } from './ErrorRateLimiter';

describe('ErrorRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits first call, throttles the immediate next, then allows after throttle window', () => {
    const l = new ErrorRateLimiter(1000, 60_000, 5);
    expect(l.shouldEmit('k')).toBe(true);
    vi.setSystemTime(1_000_500);
    expect(l.shouldEmit('k')).toBe(false);
    vi.setSystemTime(1_001_600);
    expect(l.shouldEmit('k')).toBe(true);
  });

  it('caps at maxPerWindow and invokes onSuppress once', () => {
    const l = new ErrorRateLimiter(0, 60_000, 3);
    const onSuppress = vi.fn();
    // one free emit on window reset (count stays 0), then increments to 3
    expect(l.shouldEmit('k', onSuppress)).toBe(true);
    expect(l.shouldEmit('k', onSuppress)).toBe(true);
    expect(l.shouldEmit('k', onSuppress)).toBe(true);
    expect(l.shouldEmit('k', onSuppress)).toBe(true);
    // now count == 3 == max → suppressed, callback fires once
    expect(l.shouldEmit('k', onSuppress)).toBe(false);
    expect(l.shouldEmit('k', onSuppress)).toBe(false);
    expect(onSuppress).toHaveBeenCalledTimes(1);
  });

  it('resets count after windowMs', () => {
    const l = new ErrorRateLimiter(0, 1000, 2);
    l.shouldEmit('k');
    l.shouldEmit('k');
    l.shouldEmit('k');
    expect(l.shouldEmit('k')).toBe(false);
    vi.setSystemTime(1_003_000);
    expect(l.shouldEmit('k')).toBe(true);
  });

  it('tracks keys independently', () => {
    const l = new ErrorRateLimiter(1000);
    expect(l.shouldEmit('a')).toBe(true);
    expect(l.shouldEmit('b')).toBe(true);
    expect(l.shouldEmit('a')).toBe(false);
  });
});
