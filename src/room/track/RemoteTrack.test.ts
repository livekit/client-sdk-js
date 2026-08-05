import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MockMediaStreamTrack from '../../test/MockMediaStreamTrack';
import { TrackEvent } from '../events';
import RemoteVideoTrack from './RemoteVideoTrack';

describe('RemoteTrack time sync loop', () => {
  let track: RemoteVideoTrack;
  let frames: Array<() => void>;
  let rafSpy: ReturnType<typeof vi.fn>;
  let rtpTimestamp: number;

  /** runs every currently scheduled animation frame callback once */
  const flushFrame = () => {
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb());
  };

  beforeEach(() => {
    frames = [];
    rtpTimestamp = 0;
    rafSpy = vi.fn((cb: () => void) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const receiver = {
      getSynchronizationSources: () => [{ timestamp: 1, rtpTimestamp: ++rtpTimestamp }],
    } as unknown as RTCRtpReceiver;
    track = new RemoteVideoTrack(new MockMediaStreamTrack(), 'sid', receiver, {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not schedule animation frames when nobody listens', () => {
    track.registerTimeSyncUpdate();

    expect(rafSpy).not.toHaveBeenCalled();
  });

  it('starts the loop when a listener subscribes', () => {
    track.registerTimeSyncUpdate();
    const listener = vi.fn();
    track.on(TrackEvent.TimeSyncUpdate, listener);

    expect(rafSpy).toHaveBeenCalledTimes(1);
    flushFrame();

    expect(listener).toHaveBeenCalledWith({ timestamp: 1, rtpTimestamp: 1 });
  });

  it('starts the loop for listeners that subscribed before the monitor started', () => {
    track.on(TrackEvent.TimeSyncUpdate, vi.fn());
    track.registerTimeSyncUpdate();

    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it('stops the loop once the last listener unsubscribes', () => {
    const listener = vi.fn();
    track.registerTimeSyncUpdate();
    track.on(TrackEvent.TimeSyncUpdate, listener);
    flushFrame();

    track.off(TrackEvent.TimeSyncUpdate, listener);
    flushFrame();
    const callsAfterUnsubscribe = rafSpy.mock.calls.length;
    flushFrame();

    expect(frames).toHaveLength(0);
    expect(rafSpy).toHaveBeenCalledTimes(callsAfterUnsubscribe);
  });

  it('restarts the loop when a listener subscribes again', () => {
    const listener = vi.fn();
    track.registerTimeSyncUpdate();
    track.on(TrackEvent.TimeSyncUpdate, listener);
    track.off(TrackEvent.TimeSyncUpdate, listener);
    flushFrame();
    listener.mockClear();

    track.on(TrackEvent.TimeSyncUpdate, listener);
    flushFrame();

    expect(listener).toHaveBeenCalled();
  });

  it('does not restart the loop after the monitor has been stopped', () => {
    track.registerTimeSyncUpdate();
    track.stopMonitor();
    rafSpy.mockClear();

    track.on(TrackEvent.TimeSyncUpdate, vi.fn());

    expect(rafSpy).not.toHaveBeenCalled();
  });
});
