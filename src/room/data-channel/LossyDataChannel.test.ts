import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LossyDataChannel } from './LossyDataChannel';
import { DataChannelKind } from './types';

class FakeDataChannel extends EventTarget {
  bufferedAmount = 0;

  bufferedAmountLowThreshold = 64;

  send = vi.fn();
}

// Pass `dc: null` for a handle-less channel; omit it to get a fresh one. `null` (not `undefined`)
// is deliberate — a destructuring default fills in on `undefined`, so only `null` passes through.
function makeChannel(
  bufferFullBehavior: 'drop' | 'wait',
  { dc = new FakeDataChannel() }: { dc?: FakeDataChannel | null } = {},
) {
  const state = { engineClosed: false, skipSends: false };
  const channel = new LossyDataChannel({
    kind: DataChannelKind.LOSSY,
    lowWaterMark: 64,
    highWaterMark: 1024,
    isEngineClosed: () => state.engineClosed,
    bufferFullBehavior,
    shouldSkipSends: () => state.skipSends,
  });
  if (dc) {
    channel.attach(dc as unknown as RTCDataChannel);
  }
  const stats = channel as unknown as { statCurrentBytes: number; dropCount: number };
  return { channel, dc, state, stats };
}

describe('LossyDataChannel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('drop policy: sends below the threshold and counts bytes', async () => {
    const { channel, dc, stats } = makeChannel('drop');
    const msg = new Uint8Array(10);

    await channel.send(msg);

    expect(dc.send).toHaveBeenCalledWith(msg);
    expect(stats.statCurrentBytes).toBe(10);
  });

  it('drop policy: discards while the buffer is above the dc threshold', async () => {
    const { channel, dc, stats } = makeChannel('drop');
    dc.bufferedAmount = 128; // above the 64-byte dc threshold

    await channel.send(new Uint8Array(10));

    expect(dc.send).not.toHaveBeenCalled();
    expect(stats.dropCount).toBe(1);
    expect(stats.statCurrentBytes).toBe(0);
  });

  it('wait policy: parks above the high-water mark instead of dropping', async () => {
    const { channel, dc } = makeChannel('wait');
    dc.bufferedAmount = 2048;
    const resolved = vi.fn();
    const send = channel.send(new Uint8Array(10)).then(resolved);
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).not.toHaveBeenCalled();

    dc.bufferedAmount = 0;
    dc.dispatchEvent(new Event('bufferedamountlow'));
    await send;
    expect(dc.send).toHaveBeenCalledTimes(1);
  });

  it('skips sends while a reconnect is underway', async () => {
    const { channel, dc, state } = makeChannel('drop');
    state.skipSends = true;

    await channel.send(new Uint8Array(10));

    expect(dc.send).not.toHaveBeenCalled();
  });

  it('tunes the dc threshold to ~100ms of observed byterate, clamped to the watermarks', async () => {
    const { channel, dc } = makeChannel('drop');
    channel.startThresholdTuning();

    // 10_000 bytes/second → threshold byterate/10 = 1000, clamped to the 1024 high mark? No —
    // 1000 is within [64, 1024], so it applies as-is.
    await channel.send(new Uint8Array(10_000));
    await vi.advanceTimersByTimeAsync(1000);
    expect(dc.bufferedAmountLowThreshold).toBe(1000);

    // Idle second → byterate 0 → clamps up to the low-water mark.
    await vi.advanceTimersByTimeAsync(1000);
    expect(dc.bufferedAmountLowThreshold).toBe(64);

    channel.stopThresholdTuning();
  });

  it('stopThresholdTuning halts adjustments and resets stats', async () => {
    const { channel, dc, stats } = makeChannel('drop');
    channel.startThresholdTuning();
    await channel.send(new Uint8Array(500));

    channel.stopThresholdTuning();
    expect(stats.statCurrentBytes).toBe(0);
    expect(stats.dropCount).toBe(0);

    const before = dc.bufferedAmountLowThreshold;
    await vi.advanceTimersByTimeAsync(2000);
    expect(dc.bufferedAmountLowThreshold).toBe(before);
  });
});
