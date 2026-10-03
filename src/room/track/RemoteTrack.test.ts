import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MockMediaStreamTrack from '../../test/MockMediaStreamTrack';
import { TrackEvent } from '../events';
import RemoteVideoTrack from './RemoteVideoTrack';

describe('RemoteTrack time sync loop', () => {
  let track: RemoteVideoTrack;
  let getSynchronizationSources: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // fake timers back `requestAnimationFrame`, so cancellation behaves like it does in a browser
    vi.useFakeTimers();
    // `supportsSynchronizationSources()` gates the loop on this being implemented
    vi.stubGlobal(
      'RTCRtpReceiver',
      class {
        getSynchronizationSources() {}
      },
    );

    let rtpTimestamp = 0;
    getSynchronizationSources = vi.fn(() => [{ timestamp: 1, rtpTimestamp: ++rtpTimestamp }]);
    const receiver = { getSynchronizationSources } as unknown as RTCRtpReceiver;
    track = new RemoteVideoTrack(new MockMediaStreamTrack(), 'sid', receiver, {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not sample the receiver when nobody listens', () => {
    track.startMonitor();
    vi.advanceTimersToNextFrame();

    expect(getSynchronizationSources).not.toHaveBeenCalled();
  });

  it('starts the loop when a listener subscribes', () => {
    track.startMonitor();
    const listener = vi.fn();
    track.on(TrackEvent.TimeSyncUpdate, listener);
    vi.advanceTimersToNextFrame();

    expect(listener).toHaveBeenCalledWith({ timestamp: 1, rtpTimestamp: 1 });
  });

  it('starts the loop for listeners that subscribed before the monitor started', () => {
    const listener = vi.fn();
    track.on(TrackEvent.TimeSyncUpdate, listener);
    track.startMonitor();
    vi.advanceTimersToNextFrame();

    expect(listener).toHaveBeenCalled();
  });

  it('does not start a second loop when a second listener subscribes', () => {
    track.startMonitor();
    track.on(TrackEvent.TimeSyncUpdate, vi.fn());
    track.on(TrackEvent.TimeSyncUpdate, vi.fn());

    vi.advanceTimersToNextFrame();

    // a second chain would sample twice per frame
    expect(getSynchronizationSources).toHaveBeenCalledTimes(1);
  });

  it('does not start a second loop when the monitor is started again', () => {
    track.on(TrackEvent.TimeSyncUpdate, vi.fn());
    track.startMonitor();
    track.startMonitor();
    getSynchronizationSources.mockClear();

    vi.advanceTimersToNextFrame();

    expect(getSynchronizationSources).toHaveBeenCalledTimes(1);
  });

  it('stops the loop once the last listener unsubscribes', () => {
    const listener = vi.fn();
    track.startMonitor();
    track.on(TrackEvent.TimeSyncUpdate, listener);
    vi.advanceTimersToNextFrame();

    track.off(TrackEvent.TimeSyncUpdate, listener);
    vi.advanceTimersToNextFrame();
    getSynchronizationSources.mockClear();
    vi.advanceTimersToNextFrame();

    expect(getSynchronizationSources).not.toHaveBeenCalled();
  });

  it('restarts the loop when a listener subscribes again', () => {
    const listener = vi.fn();
    track.startMonitor();
    track.on(TrackEvent.TimeSyncUpdate, listener);
    track.off(TrackEvent.TimeSyncUpdate, listener);
    vi.advanceTimersToNextFrame();
    listener.mockClear();

    track.on(TrackEvent.TimeSyncUpdate, listener);
    vi.advanceTimersToNextFrame();

    expect(listener).toHaveBeenCalled();
  });

  it('cancels a running loop when the monitor is stopped', () => {
    track.startMonitor();
    // the listener stays subscribed, so only the cancellation can stop the loop
    track.on(TrackEvent.TimeSyncUpdate, vi.fn());
    vi.advanceTimersToNextFrame();
    expect(getSynchronizationSources).toHaveBeenCalled();

    track.stopMonitor();
    getSynchronizationSources.mockClear();
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();

    expect(getSynchronizationSources).not.toHaveBeenCalled();
  });

  it('resumes the loop when the monitor is started again after a stop', () => {
    track.startMonitor();
    track.on(TrackEvent.TimeSyncUpdate, vi.fn());
    vi.advanceTimersToNextFrame();
    track.stopMonitor();
    getSynchronizationSources.mockClear();

    track.startMonitor();
    vi.advanceTimersToNextFrame();

    expect(getSynchronizationSources).toHaveBeenCalled();
  });

  it('does not restart the loop after the monitor has been stopped', () => {
    track.startMonitor();
    track.stopMonitor();

    track.on(TrackEvent.TimeSyncUpdate, vi.fn());
    vi.advanceTimersToNextFrame();

    expect(getSynchronizationSources).not.toHaveBeenCalled();
  });
});
