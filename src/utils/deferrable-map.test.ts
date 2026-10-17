import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DeferrableMap, DeferrableMapAbortError } from './deferrable-map';

describe('DeferrableMap', () => {
  let unhandled: unknown[];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeEach(() => {
    unhandled = [];
    process.on('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  it('returns an existing value immediately', async () => {
    const map = new DeferrableMap<string, number>();
    map.set('a', 1);
    await expect(map.getDeferred('a')).resolves.toBe(1);
  });

  it('resolves once the key is set', async () => {
    const map = new DeferrableMap<string, number>();
    const pending = map.getDeferred('a', new AbortController().signal);
    map.set('a', 2);
    await expect(pending).resolves.toBe(2);
  });

  it('rejects when the signal is already aborted', async () => {
    const map = new DeferrableMap<string, number>();
    const controller = new AbortController();
    controller.abort();
    await expect(map.getDeferred('a', controller.signal)).rejects.toBeInstanceOf(
      DeferrableMapAbortError,
    );
  });

  it('rejects on abort without leaving an unhandled rejection behind', async () => {
    const map = new DeferrableMap<string, number>();
    const controller = new AbortController();
    const pending = map.getDeferred('a', controller.signal);

    controller.abort('gave up');

    const error = await pending.catch((e) => e);
    expect(error).toBeInstanceOf(DeferrableMapAbortError);
    expect(error.reason).toBe('gave up');

    // give the runtime a macrotask to report unhandled rejections
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unhandled).toEqual([]);

    // the caller handled the rejection, and a later set still works
    map.set('a', 3);
    await expect(map.getDeferred('a')).resolves.toBe(3);
  });
});
