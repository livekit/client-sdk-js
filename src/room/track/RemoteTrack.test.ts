import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnhancedMockMediaStreamTrack,
  MockMediaStream,
  MockRTCRtpReceiver,
} from '../../test/mocks.enhanced';
import { TrackEvent } from '../events';
import RemoteTrack from './RemoteTrack';
import { Track } from './Track';

// Concrete implementation for testing
class TestRemoteTrack extends RemoteTrack<Track.Kind.Audio> {
  constructor(mediaTrack: MediaStreamTrack, sid: string, receiver: RTCRtpReceiver) {
    super(mediaTrack, sid, Track.Kind.Audio, receiver);
  }

  protected monitorReceiver(): void {
    // Mock implementation
  }
}

describe('RemoteTrack', () => {
  let track: TestRemoteTrack;
  let mockMediaStreamTrack: EnhancedMockMediaStreamTrack;
  let mockReceiver: MockRTCRtpReceiver;

  beforeEach(() => {
    mockMediaStreamTrack = new EnhancedMockMediaStreamTrack('audio');
    mockReceiver = new MockRTCRtpReceiver(mockMediaStreamTrack as unknown as MediaStreamTrack);
    track = new TestRemoteTrack(
      mockMediaStreamTrack as unknown as MediaStreamTrack,
      'test-sid',
      mockReceiver as unknown as RTCRtpReceiver,
    );
    global.MediaStream = MockMediaStream as any;
  });

  describe('Constructor', () => {
    it('sets sid correctly', () => {
      expect(track.sid).toBe('test-sid');
    });

    it('sets receiver correctly', () => {
      expect(track.receiver).toBe(mockReceiver);
    });

    it('sets kind correctly', () => {
      expect(track.kind).toBe(Track.Kind.Audio);
    });
  });

  describe('Properties', () => {
    it('returns isLocal as false', () => {
      expect(track.isLocal).toBe(false);
    });
  });

  describe('setMuted()', () => {
    it('updates isMuted state when muting', () => {
      track.setMuted(true);
      expect(track.isMuted).toBe(true);
    });

    it('updates isMuted state when unmuting', () => {
      track.setMuted(true);
      track.setMuted(false);
      expect(track.isMuted).toBe(false);
    });

    it('updates mediaStreamTrack.enabled', () => {
      track.setMuted(true);
      expect(mockMediaStreamTrack.enabled).toBe(false);

      track.setMuted(false);
      expect(mockMediaStreamTrack.enabled).toBe(true);
    });

    it('emits Muted event when muted', () => {
      const handler = vi.fn();
      track.on(TrackEvent.Muted, handler);
      track.setMuted(true);
      expect(handler).toHaveBeenCalledWith(track);
    });

    it('emits Unmuted event when unmuted', () => {
      track.setMuted(true);
      const handler = vi.fn();
      track.on(TrackEvent.Unmuted, handler);
      track.setMuted(false);
      expect(handler).toHaveBeenCalledWith(track);
    });

    it('does not emit if state unchanged', () => {
      track.setMuted(true);
      const handler = vi.fn();
      track.on(TrackEvent.Muted, handler);
      track.setMuted(true);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('setMediaStream()', () => {
    it('sets mediaStream property', () => {
      const stream = new MockMediaStream([
        mockMediaStreamTrack as unknown as MediaStreamTrack,
      ]) as unknown as MediaStream;
      track.setMediaStream(stream);
      expect(track.mediaStream).toBe(stream);
    });

    it('listens for removetrack event', () => {
      const stream = new MockMediaStream([
        mockMediaStreamTrack as unknown as MediaStreamTrack,
      ]) as unknown as MediaStream;
      const addEventListenerSpy = vi.spyOn(stream, 'addEventListener');
      track.setMediaStream(stream);
      expect(addEventListenerSpy).toHaveBeenCalledWith('removetrack', expect.any(Function));
    });

    it('clears receiver on track removal', () => {
      const stream = new MockMediaStream([
        mockMediaStreamTrack as unknown as MediaStreamTrack,
      ]) as unknown as MediaStream;
      track.setMediaStream(stream);

      (stream as unknown as MockMediaStream).removeTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
      );

      expect(track.receiver).toBeUndefined();
    });

    it('clears playoutDelayHint on track removal', () => {
      mockReceiver.playoutDelayHint = 1.5;
      const stream = new MockMediaStream([
        mockMediaStreamTrack as unknown as MediaStreamTrack,
      ]) as unknown as MediaStream;
      track.setMediaStream(stream);

      (stream as unknown as MockMediaStream).removeTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
      );

      expect(mockReceiver.playoutDelayHint).toBeUndefined();
    });

    it('emits Ended event on track removal', () => {
      const stream = new MockMediaStream([
        mockMediaStreamTrack as unknown as MediaStreamTrack,
      ]) as unknown as MediaStream;
      track.setMediaStream(stream);

      const handler = vi.fn();
      track.on(TrackEvent.Ended, handler);

      (stream as unknown as MockMediaStream).removeTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
      );

      expect(handler).toHaveBeenCalledWith(track);
    });
  });

  describe('start()', () => {
    it('starts monitoring', () => {
      const startMonitorSpy = vi.spyOn(track, 'startMonitor');
      track.start();
      expect(startMonitorSpy).toHaveBeenCalled();
    });

    it('enables track', () => {
      mockMediaStreamTrack.enabled = false;
      track.start();
      expect(mockMediaStreamTrack.enabled).toBe(true);
    });
  });

  describe('stop()', () => {
    it('stops monitoring', () => {
      const stopMonitorSpy = vi.spyOn(track, 'stopMonitor');
      track.stop();
      expect(stopMonitorSpy).toHaveBeenCalled();
    });

    it('disables track', () => {
      mockMediaStreamTrack.enabled = true;
      track.stop();
      expect(mockMediaStreamTrack.enabled).toBe(false);
    });
  });

  describe('getRTCStatsReport()', () => {
    it('returns stats from receiver', async () => {
      const stats = await track.getRTCStatsReport();
      expect(stats).toBeDefined();
      expect(stats?.size).toBeGreaterThan(0);
    });

    it('returns undefined if no receiver', async () => {
      track.receiver = undefined;
      const stats = await track.getRTCStatsReport();
      expect(stats).toBeUndefined();
    });

    it('returns undefined if receiver has no getStats', async () => {
      (track.receiver as any).getStats = undefined;
      const stats = await track.getRTCStatsReport();
      expect(stats).toBeUndefined();
    });
  });

  describe('setPlayoutDelay()', () => {
    it('sets playoutDelayHint on receiver', () => {
      // Ensure the property exists
      mockReceiver.playoutDelayHint = 0;
      track.setPlayoutDelay(1.5);
      expect(mockReceiver.playoutDelayHint).toBe(1.5);
    });

    it('logs warning if playoutDelayHint not supported', () => {
      const warnSpy = vi.spyOn((track as any).log, 'warn');
      delete (mockReceiver as any).playoutDelayHint;

      track.setPlayoutDelay(1.5);

      expect(warnSpy).toHaveBeenCalledWith('Playout delay not supported in this browser');
    });

    it('logs warning if track ended', () => {
      const warnSpy = vi.spyOn((track as any).log, 'warn');
      track.receiver = undefined;

      track.setPlayoutDelay(1.5);

      expect(warnSpy).toHaveBeenCalledWith('Cannot set playout delay, track already ended');
    });
  });

  describe('getPlayoutDelay()', () => {
    it('returns playoutDelayHint from receiver', () => {
      mockReceiver.playoutDelayHint = 2.0;
      const delay = track.getPlayoutDelay();
      expect(delay).toBe(2.0);
    });

    it('returns 0 if playoutDelayHint not supported', () => {
      const warnSpy = vi.spyOn((track as any).log, 'warn');
      delete (mockReceiver as any).playoutDelayHint;

      const delay = track.getPlayoutDelay();

      expect(delay).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith('Playout delay not supported in this browser');
    });

    it('returns 0 if track ended', () => {
      const warnSpy = vi.spyOn((track as any).log, 'warn');
      track.receiver = undefined;

      const delay = track.getPlayoutDelay();

      expect(delay).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith('Cannot get playout delay, track already ended');
    });
  });

  describe('Monitoring', () => {
    it('sets up monitor interval', () => {
      track.startMonitor();
      expect((track as any).monitorInterval).toBeDefined();
    });

    it('does not create duplicate intervals', () => {
      track.startMonitor();
      const interval1 = (track as any).monitorInterval;
      track.startMonitor();
      const interval2 = (track as any).monitorInterval;
      expect(interval1).toBe(interval2);
    });
  });
});
