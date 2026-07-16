import { describe, expect, it, vi } from 'vitest';
import { UnexpectedConnectionState } from '../errors';
import { FlowControlledDataChannel } from './FlowControlledDataChannel';
import { DataChannelKind } from './types';

class FakeDataChannel extends EventTarget {
  bufferedAmount = 0;

  bufferedAmountLowThreshold = 64;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeChannel(opts?: { dc?: FakeDataChannel | undefined; engineClosed?: boolean }) {
  const dc = 'dc' in (opts ?? {}) ? opts!.dc : new FakeDataChannel();
  const state = { engineClosed: opts?.engineClosed ?? false };
  const channel = new FlowControlledDataChannel({
    kind: DataChannelKind.RELIABLE,
    lowWaterMark: 64,
    highWaterMark: 1024,
    getChannel: () => dc as unknown as RTCDataChannel | undefined,
    isEngineClosed: () => state.engineClosed,
  });
  return { channel, dc: dc as FakeDataChannel, state };
}

describe('FlowControlledDataChannel', () => {
  it('reports watermark status against the current channel', () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 0;
    expect(channel.isBelowHighWaterMark()).toBe(true);
    expect(channel.isBelowLowWaterMark()).toBe(true);

    dc.bufferedAmount = 512; // between low (64) and high (1024)
    expect(channel.isBelowHighWaterMark()).toBe(true);
    expect(channel.isBelowLowWaterMark()).toBe(false);

    dc.bufferedAmount = 2048;
    expect(channel.isBelowHighWaterMark()).toBe(false);
  });

  it('throws when no channel handle is available', () => {
    const { channel } = makeChannel({ dc: undefined });
    expect(() => channel.isBelowHighWaterMark()).toThrow(TypeError);
    expect(() => channel.isBelowLowWaterMark()).toThrow(TypeError);
  });

  it('resolves immediately while below the high-water mark', async () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 1024;
    await expect(channel.waitForHeadroom()).resolves.toBeUndefined();
  });

  it('parks above the high-water mark and resumes on bufferedamountlow', async () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 2048;
    const resolved = vi.fn();
    const wait = channel.waitForHeadroom().then(resolved);
    await tick();
    expect(resolved).not.toHaveBeenCalled();

    dc.bufferedAmount = 32;
    dc.dispatchEvent(new Event('bufferedamountlow'));
    await wait;
    expect(resolved).toHaveBeenCalled();
  });

  it('rejects a parked waiter when the channel closes', async () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 2048;
    const wait = channel.waitForHeadroom();
    wait.catch(() => {});
    await tick();

    dc.dispatchEvent(new Event('close'));
    await expect(wait).rejects.toBeInstanceOf(UnexpectedConnectionState);
  });

  it('rejects a parked waiter on invalidateWaiters and recovers on the next epoch', async () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 2048;
    const wait = channel.waitForHeadroom();
    wait.catch(() => {});
    await tick();

    channel.invalidateWaiters('channel replaced');
    await expect(wait).rejects.toBeInstanceOf(UnexpectedConnectionState);

    // Fresh epoch: the gate is usable again and the lock was released.
    dc.bufferedAmount = 0;
    await expect(channel.waitForHeadroom()).resolves.toBeUndefined();
  });

  it('rejects immediately when the engine is closed', async () => {
    const { channel, state } = makeChannel();
    state.engineClosed = true;
    await expect(channel.waitForHeadroom()).rejects.toBeInstanceOf(UnexpectedConnectionState);
  });

  it('serializes waiters FIFO through the headroom lock', async () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 2048;
    const order: number[] = [];
    const first = channel.waitForHeadroom().then(() => order.push(1));
    const second = channel.waitForHeadroom().then(() => order.push(2));
    await tick();

    // One drain event wakes the head waiter; the second re-checks under the lock and, with the
    // buffer now low, proceeds right after — strictly in arrival order.
    dc.bufferedAmount = 0;
    dc.dispatchEvent(new Event('bufferedamountlow'));
    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });
});
