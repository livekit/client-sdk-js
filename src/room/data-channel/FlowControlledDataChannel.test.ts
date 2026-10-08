import { describe, expect, it, vi } from 'vitest';
import { UnexpectedConnectionState } from '../errors';
import { FlowControlledDataChannel } from './FlowControlledDataChannel';
import { DataChannelKind } from './types';

class FakeDataChannel extends EventTarget {
  bufferedAmount = 0;

  bufferedAmountLowThreshold = 64;

  readyState: RTCDataChannelState = 'open';

  // Like the real thing, close() moves to 'closing' synchronously.
  close = vi.fn(() => {
    this.readyState = 'closing';
  });
}

const handle = (dc: FakeDataChannel) => dc as unknown as RTCDataChannel;

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Pass `dc: null` for a handle-less channel; omit it to get a fresh one. `null` (not `undefined`)
// is deliberate — a destructuring default fills in on `undefined`, so only `null` passes through.
function makeChannel({
  dc = new FakeDataChannel(),
  engineClosed = false,
}: { dc?: FakeDataChannel | null; engineClosed?: boolean } = {}) {
  const state = { engineClosed };
  const onBufferStatusChanged = vi.fn();
  const channel = new FlowControlledDataChannel({
    kind: DataChannelKind.RELIABLE,
    lowWaterMark: 64,
    highWaterMark: 1024,
    isEngineClosed: () => state.engineClosed,
    onBufferStatusChanged,
  });
  if (dc) {
    channel.attach(dc as unknown as RTCDataChannel);
  }
  return { channel, dc: dc as FakeDataChannel, state, onBufferStatusChanged };
}

describe('FlowControlledDataChannel', () => {
  describe('refreshBufferStatus', () => {
    it('notifies only on a change and in both directions', () => {
      const { channel, dc, onBufferStatusChanged } = makeChannel();

      // Starts "low" (empty buffer); a refresh that stays low emits nothing.
      channel.refreshBufferStatus();
      expect(onBufferStatusChanged).not.toHaveBeenCalled();

      // Cross above the low mark → one not-low notification.
      dc.bufferedAmount = 512;
      channel.refreshBufferStatus();
      channel.refreshBufferStatus(); // debounced: no second fire
      expect(onBufferStatusChanged.mock.calls).toEqual([[false]]);

      // Drain back below → one low notification.
      dc.bufferedAmount = 0;
      channel.refreshBufferStatus();
      expect(onBufferStatusChanged.mock.calls).toEqual([[false], [true]]);
    });

    it('is a no-op without a handle (no throw, no notification)', () => {
      const { channel, onBufferStatusChanged } = makeChannel({ dc: null });
      expect(() => channel.refreshBufferStatus()).not.toThrow();
      expect(onBufferStatusChanged).not.toHaveBeenCalled();
    });
  });

  it('reports watermark status against the given channel', () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 0;
    expect(channel.isBelowHighWaterMark(handle(dc))).toBe(true);
    expect(channel.isBelowLowWaterMark(handle(dc))).toBe(true);

    dc.bufferedAmount = 512; // between low (64) and high (1024)
    expect(channel.isBelowHighWaterMark(handle(dc))).toBe(true);
    expect(channel.isBelowLowWaterMark(handle(dc))).toBe(false);

    dc.bufferedAmount = 2048;
    expect(channel.isBelowHighWaterMark(handle(dc))).toBe(false);
  });

  it('rejects a wait on a handle that is not open', async () => {
    const { channel, dc } = makeChannel();
    dc.readyState = 'connecting';
    await expect(channel.waitForHeadroomWithLock(handle(dc))).rejects.toBeInstanceOf(
      UnexpectedConnectionState,
    );
  });

  it('rejects a wait queued on the lock once its handle is replaced', async () => {
    const { channel, dc: oldDc } = makeChannel();
    oldDc.bufferedAmount = 2048;
    const parked = channel.waitForHeadroomWithLock(handle(oldDc));
    parked.catch(() => {});
    // Queued behind the parked waiter, so the abort on replacement doesn't reach it — the closed
    // handle does, once it gets the lock.
    const queued = channel.waitForHeadroomWithLock(handle(oldDc));
    queued.catch(() => {});
    await tick();

    channel.attach(handle(new FakeDataChannel()));

    await expect(parked).rejects.toBeInstanceOf(UnexpectedConnectionState);
    await expect(queued).rejects.toBeInstanceOf(UnexpectedConnectionState);
  });

  it('resolves immediately while below the high-water mark', async () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 1024;
    await expect(channel.waitForHeadroomWithLock(handle(dc))).resolves.toBeUndefined();
  });

  it('parks above the high-water mark and resumes on bufferedamountlow', async () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 2048;
    const resolved = vi.fn();
    const wait = channel.waitForHeadroomWithLock(handle(dc)).then(resolved);
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
    const wait = channel.waitForHeadroomWithLock(handle(dc));
    wait.catch(() => {});
    await tick();

    dc.dispatchEvent(new Event('close'));
    await expect(wait).rejects.toBeInstanceOf(UnexpectedConnectionState);
  });

  it('rejects a parked waiter on invalidateWaiters and recovers with a fresh controller', async () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 2048;
    const wait = channel.waitForHeadroomWithLock(handle(dc));
    wait.catch(() => {});
    await tick();

    channel.invalidateWaiters('channel replaced');
    await expect(wait).rejects.toBeInstanceOf(UnexpectedConnectionState);

    // Fresh controller: the gate is usable again and the lock was released.
    dc.bufferedAmount = 0;
    await expect(channel.waitForHeadroomWithLock(handle(dc))).resolves.toBeUndefined();
  });

  it('closes the handle it lets go of, on replacement and on detach', () => {
    const { channel, dc: first } = makeChannel();
    const second = new FakeDataChannel();

    channel.attach(first as unknown as RTCDataChannel); // re-attaching the same handle is a no-op
    expect(first.close).not.toHaveBeenCalled();

    channel.attach(second as unknown as RTCDataChannel);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).not.toHaveBeenCalled();

    channel.detach();
    expect(second.close).toHaveBeenCalledTimes(1);
    expect(channel.channelHandle).toBeUndefined();
  });

  it('rejects immediately when the engine is closed', async () => {
    const { channel, dc, state } = makeChannel();
    state.engineClosed = true;
    await expect(channel.waitForHeadroomWithLock(handle(dc))).rejects.toBeInstanceOf(
      UnexpectedConnectionState,
    );
  });

  it('serializes waiters FIFO through the headroom lock', async () => {
    const { channel, dc } = makeChannel();
    dc.bufferedAmount = 2048;
    const order: number[] = [];
    const first = channel.waitForHeadroomWithLock(handle(dc)).then(() => order.push(1));
    const second = channel.waitForHeadroomWithLock(handle(dc)).then(() => order.push(2));
    await tick();

    // One drain event wakes the head waiter; the second re-checks under the lock and, with the
    // buffer now low, proceeds right after — strictly in arrival order.
    dc.bufferedAmount = 0;
    dc.dispatchEvent(new Event('bufferedamountlow'));
    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });
});
