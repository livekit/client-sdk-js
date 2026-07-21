import { describe, expect, it, vi } from 'vitest';
import type { PCTransportManager } from '../PCTransportManager';
import { UnexpectedConnectionState } from '../errors';
import { DataChannelManager, type DataChannelManagerOptions } from './DataChannelManager';
import { DataChannelKind } from './types';

class FakeDataChannel extends EventTarget {
  bufferedAmount = 0;

  bufferedAmountLowThreshold = 0;

  onmessage: ((message: MessageEvent) => void) | null = null;

  onerror: ((event: Event) => void) | null = null;

  onclose: (() => void) | null = null;

  onbufferedamountlow: (() => void) | null = null;

  send = vi.fn();

  close = vi.fn();

  constructor(public label: string) {
    super();
  }
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function makeManager(overrides?: Partial<DataChannelManagerOptions>) {
  const opts = {
    isEngineClosed: () => false,
    isReconnecting: () => false,
    onDataMessage: vi.fn(),
    onDataTrackMessage: vi.fn(),
    onDataError: vi.fn(),
    onChannelClose: vi.fn(),
    onBufferStatusChanged: vi.fn(),
    ...overrides,
  };
  const manager = new DataChannelManager(opts);
  const created: Record<string, FakeDataChannel> = {};
  const pcManager = {
    createPublisherDataChannel: vi.fn((label: string) => {
      const dc = new FakeDataChannel(label);
      created[label] = dc;
      return dc as unknown as RTCDataChannel;
    }),
  } as unknown as PCTransportManager;
  return { manager, opts, pcManager, created };
}

describe('DataChannelManager', () => {
  it('creates and wires the three publisher channels', () => {
    const { manager, opts, pcManager, created } = makeManager();

    manager.createPublisherChannels(pcManager);

    expect(Object.keys(created).sort()).toEqual(['_data_track', '_lossy', '_reliable']);
    expect(manager.getHandle(DataChannelKind.RELIABLE)).toBe(created._reliable);
    expect(manager.hasPublisherChannels).toBe(true);
    for (const dc of Object.values(created)) {
      expect(dc.onmessage).toBeTruthy();
      expect(dc.onerror).toBeTruthy();
      expect(dc.onclose).toBeTruthy();
      expect(dc.onbufferedamountlow).toBeTruthy();
      expect(dc.bufferedAmountLowThreshold).toBeGreaterThan(0);
    }

    // Close handler reports the right kind.
    created._reliable.onclose!();
    expect(opts.onChannelClose).toHaveBeenCalledWith(DataChannelKind.RELIABLE);

    // A drain event on the data-track channel refreshes its status; since the buffer starts empty
    // (below the low mark) and the wrapper's initial status is already "low", no change fires —
    // fill it first so the drain is an observable not-low → low transition.
    const dataTrackDc = created._data_track;
    dataTrackDc.bufferedAmount = 10 * 1024 * 1024;
    dataTrackDc.onbufferedamountlow!(); // refresh: now "not low"
    dataTrackDc.bufferedAmount = 0;
    dataTrackDc.onbufferedamountlow!(); // refresh: back to "low"
    expect(opts.onBufferStatusChanged).toHaveBeenCalledWith(
      DataChannelKind.DATA_TRACK_LOSSY,
      false,
    );
    expect(opts.onBufferStatusChanged).toHaveBeenCalledWith(DataChannelKind.DATA_TRACK_LOSSY, true);

    manager.lossy.stopThresholdTuning();
  });

  it('recreating channels rejects waiters parked on the replaced handles', async () => {
    const { manager, pcManager, created } = makeManager();
    manager.createPublisherChannels(pcManager);

    // Park a reliable sender on the first-generation channel.
    created._reliable.bufferedAmount = 2 * 1024 * 1024;
    const parked = manager.reliable.waitForHeadroomWithLock();
    parked.catch(() => {});
    await tick();

    // Safari null-id path: channels recreated without closing the old ones.
    manager.createPublisherChannels(pcManager);

    await expect(parked).rejects.toBeInstanceOf(UnexpectedConnectionState);
    // The gate recovers against the fresh (empty) channel.
    await expect(manager.reliable.waitForHeadroomWithLock()).resolves.toBeUndefined();

    manager.lossy.stopThresholdTuning();
  });

  it('adopts subscriber channels by label and rejects unknown labels', () => {
    const { manager, opts } = makeManager();

    const sub = new FakeDataChannel('_reliable');
    expect(manager.adoptSubscriberChannel(sub as unknown as RTCDataChannel)).toBe(true);
    expect(manager.getHandle(DataChannelKind.RELIABLE, true)).toBe(sub);
    expect(sub.onmessage).toBe(opts.onDataMessage);

    const dataTrackSub = new FakeDataChannel('_data_track');
    expect(manager.adoptSubscriberChannel(dataTrackSub as unknown as RTCDataChannel)).toBe(true);
    expect(dataTrackSub.onmessage).toBe(opts.onDataTrackMessage);

    expect(
      manager.adoptSubscriberChannel(new FakeDataChannel('_other') as unknown as RTCDataChannel),
    ).toBe(false);
  });

  it('teardown rejects parked waiters, closes all handles, and detaches', async () => {
    const { manager, pcManager, created } = makeManager();
    manager.createPublisherChannels(pcManager);
    const sub = new FakeDataChannel('_lossy');
    manager.adoptSubscriberChannel(sub as unknown as RTCDataChannel);

    created._reliable.bufferedAmount = 2 * 1024 * 1024;
    const parked = manager.reliable.waitForHeadroomWithLock();
    parked.catch(() => {});
    await tick();

    manager.teardown();

    await expect(parked).rejects.toBeInstanceOf(UnexpectedConnectionState);
    for (const dc of [...Object.values(created), sub]) {
      expect(dc.close).toHaveBeenCalled();
      expect(dc.onmessage).toBeNull();
    }
    expect(manager.hasPublisherChannels).toBe(false);
    expect(manager.getHandle(DataChannelKind.LOSSY, true)).toBeUndefined();

    manager.lossy.stopThresholdTuning();
  });
});
