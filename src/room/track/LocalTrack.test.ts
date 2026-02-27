import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnhancedMockMediaStreamTrack,
  MockHTMLVideoElement,
  MockMediaStream,
  MockRTCRtpSender,
} from '../../test/mocks.enhanced';
import { TrackEvent } from '../events';
import { TrackInvalidError } from '../errors';
import LocalTrack from './LocalTrack';
import { Track } from './Track';

// Mock getBrowser to avoid navigator issues
vi.mock('../../utils/browserParser', () => ({
  getBrowser: vi.fn().mockReturnValue({
    name: 'Chrome',
    version: '120.0.0',
    os: 'macOS',
  }),
}));

// Concrete implementation for testing
class TestLocalTrack extends LocalTrack<Track.Kind.Video> {
  constructor(
    mediaTrack: MediaStreamTrack,
    constraints?: MediaTrackConstraints,
    userProvidedTrack = false,
  ) {
    super(mediaTrack, Track.Kind.Video, constraints, userProvidedTrack);
  }

  async restartTrack(): Promise<void> {
    return this.restart();
  }

  protected monitorSender(): void {}

  startMonitor(): void {}
}

describe('LocalTrack', () => {
  let track: TestLocalTrack;
  let mockMediaStreamTrack: EnhancedMockMediaStreamTrack;

  beforeEach(() => {
    mockMediaStreamTrack = new EnhancedMockMediaStreamTrack('video', { width: 640, height: 480 });
    global.MediaStream = MockMediaStream as any;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(
          new MockMediaStream([new EnhancedMockMediaStreamTrack('video')]) as unknown as MediaStream,
        ),
      },
    } as any;
  });

  describe('Constructor', () => {
    it('accepts user-provided track flag', () => {
      const userTrack = new TestLocalTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        undefined,
        true,
      );
      expect(userTrack.isUserProvided).toBe(true);
    });

    it('initializes constraints from MediaStreamTrack', () => {
      mockMediaStreamTrack.getConstraints = vi.fn().mockReturnValue({ width: 640 });
      const newTrack = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      expect(newTrack.constraints).toEqual({ width: 640 });
    });

    it('accepts custom constraints', () => {
      const constraints = { width: 1920, height: 1080 };
      const newTrack = new TestLocalTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        constraints,
      );
      expect(newTrack.constraints).toEqual(constraints);
    });

    it('sets providedByUser to false by default', () => {
      const newTrack = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      expect(newTrack.isUserProvided).toBe(false);
    });
  });

  describe('Properties', () => {
    beforeEach(() => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
    });

    it('returns correct id from mediaStreamTrack', () => {
      expect(track.id).toBe(mockMediaStreamTrack.id);
    });

    it('returns dimensions for video tracks', async () => {
      // Wait for initialization
      await new Promise((resolve) => setTimeout(resolve, 10));
      const dimensions = track.dimensions;
      expect(dimensions).toBeDefined();
      expect(dimensions?.width).toBe(640);
      expect(dimensions?.height).toBe(480);
    });

    it('returns isLocal as true', () => {
      expect(track.isLocal).toBe(true);
    });

    it('returns isUpstreamPaused as false initially', () => {
      expect(track.isUpstreamPaused).toBe(false);
    });
  });

  describe('mute() / unmute()', () => {
    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('sets isMuted correctly on mute', async () => {
      await track.mute();
      expect(track.isMuted).toBe(true);
    });

    it('sets isMuted correctly on unmute', async () => {
      await track.mute();
      await track.unmute();
      expect(track.isMuted).toBe(false);
    });

    it('disables mediaStreamTrack on mute', async () => {
      await track.mute();
      expect(mockMediaStreamTrack.enabled).toBe(false);
    });

    it('enables mediaStreamTrack on unmute', async () => {
      await track.mute();
      await track.unmute();
      expect(mockMediaStreamTrack.enabled).toBe(true);
    });

    it('emits Muted event', async () => {
      const handler = vi.fn();
      track.on(TrackEvent.Muted, handler);
      await track.mute();
      expect(handler).toHaveBeenCalledWith(track);
    });

    it('emits Unmuted event', async () => {
      await track.mute();
      const handler = vi.fn();
      track.on(TrackEvent.Unmuted, handler);
      await track.unmute();
      expect(handler).toHaveBeenCalledWith(track);
    });
  });

  describe('waitForDimensions()', () => {
    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('returns dimensions when available', async () => {
      const dimensions = await track.waitForDimensions();
      expect(dimensions.width).toBe(640);
      expect(dimensions.height).toBe(480);
    });

    it('waits and polls for dimensions', async () => {
      const newTrack = new EnhancedMockMediaStreamTrack('video');
      const testTrack = new TestLocalTrack(newTrack as unknown as MediaStreamTrack);

      // Set dimensions after a delay
      setTimeout(() => {
        newTrack.updateSettings({ width: 1280, height: 720 });
      }, 100);

      const dimensions = await testTrack.waitForDimensions(500);
      expect(dimensions.width).toBe(1280);
      expect(dimensions.height).toBe(720);
    });

    it('throws error after timeout', async () => {
      const newTrack = new EnhancedMockMediaStreamTrack('video');
      const testTrack = new TestLocalTrack(newTrack as unknown as MediaStreamTrack);

      await expect(testTrack.waitForDimensions(100)).rejects.toThrow(TrackInvalidError);
    });
  });

  describe('setDeviceId()', () => {
    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('updates constraints', async () => {
      await track.setDeviceId('new-device-id');
      expect(track.constraints.deviceId).toBe('new-device-id');
    });

    it('returns true if device changed successfully', async () => {
      const newTrack = new EnhancedMockMediaStreamTrack('video', { deviceId: 'new-device-id' });
      (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(
        new MockMediaStream([newTrack]) as unknown as MediaStream,
      );

      const result = await track.setDeviceId('new-device-id');
      expect(result).toBe(true);
    });

    it('skips restart if track is muted', async () => {
      await track.mute();
      const restartSpy = vi.spyOn(track, 'restartTrack');
      await track.setDeviceId('new-device-id');
      expect(restartSpy).not.toHaveBeenCalled();
    });

    it('returns early if device ID unchanged', async () => {
      mockMediaStreamTrack.updateSettings({ deviceId: 'same-device' });
      (track as any)._constraints = { deviceId: 'same-device' };
      const result = await track.setDeviceId('same-device');
      expect(result).toBe(true);
    });
  });

  describe('replaceTrack()', () => {
    let sender: MockRTCRtpSender;

    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('replaces mediaStreamTrack', async () => {
      const newTrack = new EnhancedMockMediaStreamTrack('video');
      await track.replaceTrack(newTrack as unknown as MediaStreamTrack, true);

      // The internal _mediaStreamTrack should be updated
      expect((track as any)._mediaStreamTrack).toBe(newTrack);
    });

    it('updates sender', async () => {
      const newTrack = new EnhancedMockMediaStreamTrack('video');
      const replaceSpy = vi.spyOn(sender, 'replaceTrack');

      await track.replaceTrack(newTrack as unknown as MediaStreamTrack, true);

      expect(replaceSpy).toHaveBeenCalled();
    });

    it('sets providedByUser flag', async () => {
      const newTrack = new EnhancedMockMediaStreamTrack('video');
      await track.replaceTrack(newTrack as unknown as MediaStreamTrack, true);
      expect(track.isUserProvided).toBe(true);
    });

    it('throws error if track not published', async () => {
      const unpublishedTrack = new TestLocalTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
      );
      const newTrack = new EnhancedMockMediaStreamTrack('video');

      await expect(
        unpublishedTrack.replaceTrack(newTrack as unknown as MediaStreamTrack),
      ).rejects.toThrow(TrackInvalidError);
    });
  });

  describe('restart()', () => {
    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('acquires new track with constraints', async () => {
      const getUserMediaSpy = vi.spyOn(navigator.mediaDevices, 'getUserMedia');
      await track.restartTrack();
      expect(getUserMediaSpy).toHaveBeenCalled();
    });

    it('stops old track before acquiring new one', async () => {
      const stopSpy = vi.spyOn(mockMediaStreamTrack, 'stop');
      await track.restartTrack();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('emits Restarted event', async () => {
      const handler = vi.fn();
      track.on(TrackEvent.Restarted, handler);
      await track.restartTrack();
      expect(handler).toHaveBeenCalledWith(track);
    });

    it('handles manual stop during restart', async () => {
      const newTrack = new EnhancedMockMediaStreamTrack('video');
      (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(
        new MockMediaStream([newTrack]) as unknown as MediaStream,
      );

      const restartPromise = track.restartTrack();
      (track as any).manuallyStopped = true;
      await restartPromise;

      expect(newTrack.readyState).toBe('ended');
    });
  });

  describe('pauseUpstream() / resumeUpstream()', () => {
    let sender: MockRTCRtpSender;

    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('replaces sender track with null when pausing', async () => {
      const replaceSpy = vi.spyOn(sender, 'replaceTrack');
      await track.pauseUpstream();
      expect(replaceSpy).toHaveBeenCalledWith(null);
    });

    it('replaces sender track when resuming', async () => {
      await track.pauseUpstream();
      const replaceSpy = vi.spyOn(sender, 'replaceTrack');
      await track.resumeUpstream();
      expect(replaceSpy).toHaveBeenCalled();
    });

    it('emits UpstreamPaused event', async () => {
      const handler = vi.fn();
      track.on(TrackEvent.UpstreamPaused, handler);
      await track.pauseUpstream();
      expect(handler).toHaveBeenCalledWith(track);
    });

    it('emits UpstreamResumed event', async () => {
      await track.pauseUpstream();
      const handler = vi.fn();
      track.on(TrackEvent.UpstreamResumed, handler);
      await track.resumeUpstream();
      expect(handler).toHaveBeenCalledWith(track);
    });

    it('handles already paused state', async () => {
      await track.pauseUpstream();
      const replaceSpy = vi.spyOn(sender, 'replaceTrack');
      replaceSpy.mockClear();

      await track.pauseUpstream();
      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it('handles already resumed state', async () => {
      const replaceSpy = vi.spyOn(sender, 'replaceTrack');
      await track.resumeUpstream();
      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });

  describe('Track Event Handlers', () => {
    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('handles ended event correctly', () => {
      const handler = vi.fn();
      track.on(TrackEvent.Ended, handler);

      mockMediaStreamTrack.triggerEnded();

      expect(handler).toHaveBeenCalledWith(track);
    });

    it('sets reacquireTrack flag when ended in background', () => {
      (track as any).isInBackground = true;
      mockMediaStreamTrack.triggerEnded();
      expect((track as any).reacquireTrack).toBe(true);
    });
  });

  describe('getRTCStatsReport()', () => {
    let sender: MockRTCRtpSender;

    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('returns stats from sender', async () => {
      const stats = await track.getRTCStatsReport();
      expect(stats).toBeDefined();
    });

    it('returns undefined if no sender', async () => {
      (track as any)._sender = undefined;
      const stats = await track.getRTCStatsReport();
      expect(stats).toBeUndefined();
    });
  });

  describe('stop()', () => {
    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('sets manuallyStopped flag', () => {
      track.stop();
      expect((track as any).manuallyStopped).toBe(true);
    });

    it('calls parent stop()', () => {
      const stopSpy = vi.spyOn(mockMediaStreamTrack, 'stop');
      track.stop();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('cleans up processor if present', async () => {
      const mockProcessor = {
        init: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
        processedTrack: new EnhancedMockMediaStreamTrack('video') as unknown as MediaStreamTrack,
        restart: vi.fn(),
        name: 'mock-processor',
      };

      (track as any).processor = mockProcessor;
      track.stop();

      expect(mockProcessor.destroy).toHaveBeenCalled();
    });
  });

  describe('getDeviceId()', () => {
    beforeEach(async () => {
      track = new TestLocalTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('returns deviceId from settings', async () => {
      mockMediaStreamTrack.updateSettings({ deviceId: 'test-device-id' });
      const deviceId = await track.getDeviceId(false);
      expect(deviceId).toBe('test-device-id');
    });

    it('returns undefined for screen share', async () => {
      track.source = Track.Source.ScreenShare;
      const deviceId = await track.getDeviceId();
      expect(deviceId).toBeUndefined();
    });
  });
});
