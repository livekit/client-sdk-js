import { afterEach, describe, expect, it, vi } from 'vitest';
import DefaultReconnectPolicy from './DefaultReconnectPolicy';

const delayFor = (policy: DefaultReconnectPolicy, retryCount: number, random: number) => {
  vi.spyOn(Math, 'random').mockReturnValue(random);
  return policy.nextRetryDelayInMs({ retryCount, elapsedMs: 0 });
};

describe('DefaultReconnectPolicy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spreads the first retry over a window instead of retrying immediately', () => {
    const policy = new DefaultReconnectPolicy();
    expect(delayFor(policy, 0, 0)).toBe(0);
    expect(delayFor(policy, 0, 0.5)).toBe(250);
    expect(delayFor(policy, 0, 0.999)).toBeGreaterThan(450);
    expect(delayFor(policy, 0, 0.999)).toBeLessThan(500);
  });

  it('scales the jitter of later retries with the delay', () => {
    const policy = new DefaultReconnectPolicy();
    expect(delayFor(policy, 1, 0)).toBe(150);
    expect(delayFor(policy, 1, 0.5)).toBe(300);
    expect(delayFor(policy, 2, 0)).toBe(600);
    expect(delayFor(policy, 2, 0.5)).toBe(1200);
    expect(delayFor(policy, 9, 0)).toBe(3500);
    expect(delayFor(policy, 9, 0.999)).toBeLessThan(10500);
  });

  it('returns a different delay for each client on every retry', () => {
    const policy = new DefaultReconnectPolicy();
    for (let retryCount = 0; retryCount < 10; retryCount++) {
      expect(delayFor(policy, retryCount, 0.1)).not.toBe(delayFor(policy, retryCount, 0.9));
    }
  });

  it('returns null once the retries are exhausted', () => {
    const policy = new DefaultReconnectPolicy([0, 100]);
    expect(policy.nextRetryDelayInMs({ retryCount: 2, elapsedMs: 0 })).toBeNull();
    expect(
      new DefaultReconnectPolicy().nextRetryDelayInMs({ retryCount: 10, elapsedMs: 0 }),
    ).toBeNull();
  });

  it('applies jitter to custom delays', () => {
    const policy = new DefaultReconnectPolicy([1000]);
    expect(delayFor(policy, 0, 0.5)).toBe(1000);
    expect(delayFor(policy, 0, 0)).toBe(500);
  });

  it('keeps a zero delay at a later index immediate', () => {
    const policy = new DefaultReconnectPolicy([100, 0]);
    expect(delayFor(policy, 1, 0.5)).toBe(0);
    expect(delayFor(policy, 1, 0.999)).toBe(0);
  });
});
