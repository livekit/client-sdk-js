import { describe, expect, it, vi } from 'vitest';
import { UnexpectedConnectionState } from '../errors';
import { ReliableDataChannel } from './ReliableDataChannel';
import { DataChannelKind } from './types';

class FakeDataChannel extends EventTarget {
  bufferedAmount = 0;

  bufferedAmountLowThreshold = 64;

  send = vi.fn();
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Pass `dc: null` for a handle-less channel; omit it to get a fresh one. `null` (not `undefined`)
// is deliberate — a destructuring default fills in on `undefined`, so only `null` passes through.
function makeChannel({ dc = new FakeDataChannel() }: { dc?: FakeDataChannel | null } = {}) {
  const state = { engineClosed: false, deferring: false };
  const channel = new ReliableDataChannel({
    kind: DataChannelKind.RELIABLE,
    lowWaterMark: 64,
    highWaterMark: 1024,
    isEngineClosed: () => state.engineClosed,
    isDeferringSends: () => state.deferring,
  });
  if (dc) {
    channel.attach(dc as unknown as RTCDataChannel);
  }
  const buffer = (channel as unknown as { messageBuffer: { getAll(): unknown[]; length: number } })
    .messageBuffer as unknown as {
    getAll(): Array<{ data: Uint8Array; sequence: number; sent: boolean }>;
    length: number;
  };
  return { channel, dc, state, buffer };
}

describe('ReliableDataChannel', () => {
  it('hands out monotonic sequences and resets them with the session', () => {
    const { channel } = makeChannel();
    expect(channel.nextSequence()).toBe(1);
    expect(channel.nextSequence()).toBe(2);
    channel.reset();
    expect(channel.nextSequence()).toBe(1);
  });

  it('sends below the high-water mark and retains the packet for replay as sent', async () => {
    const { channel, dc, buffer } = makeChannel();
    const msg = new Uint8Array([1]);

    await channel.send(msg, channel.nextSequence());

    expect(dc.send).toHaveBeenCalledWith(msg);
    expect(buffer.getAll()).toEqual([{ data: msg, sequence: 1, sent: true }]);
  });

  it('queues unsent while sends are deferred (reconnect window)', async () => {
    const { channel, dc, state, buffer } = makeChannel();
    state.deferring = true;

    await channel.send(new Uint8Array([1]), channel.nextSequence());

    expect(dc.send).not.toHaveBeenCalled();
    expect(buffer.getAll()[0].sent).toBe(false);
  });

  it('queues unsent and resolves when the headroom wait is torn down transiently', async () => {
    const { channel, dc, buffer } = makeChannel();
    dc.bufferedAmount = 2048; // above high mark → send parks
    const send = channel.send(new Uint8Array([1]), channel.nextSequence());
    await tick();

    channel.invalidateWaiters('channel replaced');

    await expect(send).resolves.toBeUndefined();
    expect(dc.send).not.toHaveBeenCalled();
    expect(buffer.getAll()[0].sent).toBe(false);
  });

  it('rejects when the engine is closed while waiting', async () => {
    const { channel, dc, state } = makeChannel();
    dc.bufferedAmount = 2048;
    const send = channel.send(new Uint8Array([1]), channel.nextSequence());
    send.catch(() => {});
    await tick();

    state.engineClosed = true;
    channel.invalidateWaiters('engine closed');

    await expect(send).rejects.toBeInstanceOf(UnexpectedConnectionState);
  });

  it('replay drops acked packets, resends the rest in order, and marks them sent', async () => {
    const { channel, dc, buffer } = makeChannel();
    const acked = new Uint8Array([1]);
    const unacked = new Uint8Array([2]);
    await channel.send(acked, channel.nextSequence());
    await channel.send(unacked, channel.nextSequence());
    // A packet queued unsent during the reconnect window joins the replay.
    const queued = new Uint8Array([3]);
    (channel as unknown as { isDeferringSends: () => boolean }).isDeferringSends = () => true;
    await channel.send(queued, 3);
    dc.send.mockClear();

    await channel.replay(1); // server acked sequence 1

    expect(dc.send.mock.calls.map(([data]) => data)).toEqual([unacked, queued]);
    expect(buffer.getAll().every((item) => item.sent)).toBe(true);
  });

  it('transmits a packet deferred mid-replay instead of marking it sent without sending', async () => {
    const { channel, dc, state, buffer } = makeChannel();
    // A packet sent before the disconnect, still buffered (unacked) at resume.
    await channel.send(new Uint8Array([1]), channel.nextSequence());
    dc.send.mockClear();

    // Replay parks on a full buffer, giving an await window mid-drain.
    dc.bufferedAmount = 2048;
    const replay = channel.replay(0);
    await tick();

    // A send arrives while replay is parked; the reconnect is still active, so it defers into the
    // buffer as sent:false — after replay's first drain pass already started.
    state.deferring = true;
    await channel.send(new Uint8Array([2]), channel.nextSequence());
    state.deferring = false;

    dc.bufferedAmount = 0;
    dc.dispatchEvent(new Event('bufferedamountlow'));
    await replay;

    // The drain loop must transmit both; a blanket mark-all-sent would flip the late arrival to
    // sent without sending it, and a later align would then strand it.
    expect(dc.send.mock.calls.map(([d]) => d[0])).toEqual([1, 2]);
    expect(buffer.getAll().filter((i) => !i.sent)).toHaveLength(0);
  });

  it('holds the headroom lock across the whole replay so new sends cannot interleave', async () => {
    const { channel, dc } = makeChannel();
    (channel as unknown as { isDeferringSends: () => boolean }).isDeferringSends = () => true;
    await channel.send(new Uint8Array([1]), 1);
    await channel.send(new Uint8Array([2]), 2);
    (channel as unknown as { isDeferringSends: () => boolean }).isDeferringSends = () => false;

    // Replay parks on a full buffer while a concurrent send races it.
    dc.bufferedAmount = 2048;
    const replay = channel.replay(0);
    await tick();
    const concurrent = channel.send(new Uint8Array([9]), channel.nextSequence());
    await tick();

    dc.bufferedAmount = 0;
    dc.dispatchEvent(new Event('bufferedamountlow'));
    await Promise.all([replay, concurrent]);

    expect(dc.send.mock.calls.map(([data]) => data[0])).toEqual([1, 2, 9]);
  });
});
