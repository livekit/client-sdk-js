import { SubscribedCodec, SubscribedQuality } from '@livekit/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnhancedMockMediaStreamTrack,
  MockHTMLVideoElement,
  MockMediaStream,
  MockRTCRtpSender,
  MockSignalClient,
} from '../../test/mocks.enhanced';
import { TrackEvent } from '../events';
import LocalVideoTrack, {
  SimulcastTrackInfo,
  videoLayersFromEncodings,
  videoQualityForRid,
} from './LocalVideoTrack';
import { Track, VideoQuality } from './Track';

// Mock utilities
vi.mock('../../utils/browserParser', () => ({
  getBrowser: vi.fn().mockReturnValue({
    name: 'Chrome',
    version: '120.0.0',
    os: 'macOS',
  }),
}));

vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils');
  return {
    ...actual,
    isWeb: vi.fn().mockReturnValue(true),
    isMobile: vi.fn().mockReturnValue(false),
    isFireFox: vi.fn().mockReturnValue(false),
    isSVCCodec: vi.fn().mockReturnValue(false),
  };
});

describe('LocalVideoTrack', () => {
  let track: LocalVideoTrack;
  let mockMediaStreamTrack: EnhancedMockMediaStreamTrack;
  let mockSignalClient: MockSignalClient;

  beforeEach(() => {
    mockMediaStreamTrack = new EnhancedMockMediaStreamTrack('video', {
      width: 1280,
      height: 720,
    });
    mockSignalClient = new MockSignalClient();
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

  describe('Constructor & Properties', () => {
    it('creates track with video kind', () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      expect(track.kind).toBe(Track.Kind.Video);
    });

    it('initializes with default userProvidedTrack as true', () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      expect(track.isUserProvided).toBe(true);
    });

    it('accepts custom userProvidedTrack value', () => {
      track = new LocalVideoTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        undefined,
        false,
      );
      expect(track.isUserProvided).toBe(false);
    });

    it('creates senderLock mutex', () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      expect((track as any).senderLock).toBeDefined();
    });

    it('returns isSimulcast false when sender has single encoding', async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const sender = new MockRTCRtpSender(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        [{ active: true }],
      );
      (track as any)._sender = sender;

      expect(track.isSimulcast).toBe(false);
    });

    it('returns isSimulcast true when sender has multiple encodings', async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
        { active: true, rid: 'h' },
        { active: true, rid: 'q' },
      ]);
      (track as any)._sender = sender;

      expect(track.isSimulcast).toBe(true);
    });
  });

  describe('Simulcast Management', () => {
    beforeEach(async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('addSimulcastTrack() adds new codec track info', () => {
      const info = track.addSimulcastTrack('vp9');
      expect(info).toBeDefined();
      expect(info?.codec).toBe('vp9');
      expect(track.simulcastCodecs.has('vp9')).toBe(true);
    });

    it('addSimulcastTrack() clones mediaStreamTrack', () => {
      const cloneSpy = vi.spyOn(mockMediaStreamTrack, 'clone');
      track.addSimulcastTrack('h264');
      expect(cloneSpy).toHaveBeenCalled();
    });

    it('addSimulcastTrack() returns undefined if codec already exists', () => {
      track.addSimulcastTrack('vp8');
      const result = track.addSimulcastTrack('vp8');
      expect(result).toBeUndefined();
    });

    it('addSimulcastTrack() stores encodings', () => {
      const encodings = [{ active: true, maxBitrate: 500000 }];
      const info = track.addSimulcastTrack('av1', encodings);
      expect(info?.encodings).toBe(encodings);
    });

    it('setSimulcastTrackSender() sets sender on codec info', () => {
      track.addSimulcastTrack('vp9');
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);

      track.setSimulcastTrackSender('vp9', sender as unknown as RTCRtpSender);

      const info = track.simulcastCodecs.get('vp9');
      expect(info?.sender).toBe(sender);
    });

    it('setSimulcastTrackSender() refreshes subscribed codecs after delay', () => {
      vi.useFakeTimers();
      track.addSimulcastTrack('vp9');
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      (track as any).subscribedCodecs = [{ codec: 'vp9', qualities: [] }];
      const setPublishingSpy = vi.spyOn(track as any, 'setPublishingCodecs');

      track.setSimulcastTrackSender('vp9', sender as unknown as RTCRtpSender);

      vi.advanceTimersByTime(5000);
      expect(setPublishingSpy).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('setSimulcastTrackSender() does nothing if codec doesn\'t exist', () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      track.setSimulcastTrackSender('vp9', sender as unknown as RTCRtpSender);
      expect(track.simulcastCodecs.has('vp9')).toBe(false);
    });

    it('simulcastCodecs map is properly maintained', () => {
      track.addSimulcastTrack('vp8');
      track.addSimulcastTrack('vp9');
      track.addSimulcastTrack('h264');

      expect(track.simulcastCodecs.size).toBe(3);
      expect(track.simulcastCodecs.has('vp8')).toBe(true);
      expect(track.simulcastCodecs.has('vp9')).toBe(true);
      expect(track.simulcastCodecs.has('h264')).toBe(true);
    });

    it('stop() stops all simulcast codec tracks', () => {
      const info1 = track.addSimulcastTrack('vp9');
      const info2 = track.addSimulcastTrack('h264');

      const stopSpy1 = vi.spyOn(info1!.mediaStreamTrack, 'stop');
      const stopSpy2 = vi.spyOn(info2!.mediaStreamTrack, 'stop');

      track.stop();

      expect(stopSpy1).toHaveBeenCalled();
      expect(stopSpy2).toHaveBeenCalled();
    });

    it('pauseUpstream() pauses all simulcast codec senders', async () => {
      const info = track.addSimulcastTrack('vp9');
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      info!.sender = sender as unknown as RTCRtpSender;

      const replaceSpy = vi.spyOn(sender, 'replaceTrack');
      const mainSender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      (track as any)._sender = mainSender;

      await track.pauseUpstream();

      expect(replaceSpy).toHaveBeenCalledWith(null);
    });

    it('resumeUpstream() resumes all simulcast codec senders', async () => {
      const info = track.addSimulcastTrack('vp9');
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      info!.sender = sender as unknown as RTCRtpSender;

      const mainSender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      (track as any)._sender = mainSender;
      await track.pauseUpstream();

      const replaceSpy = vi.spyOn(sender, 'replaceTrack');
      await track.resumeUpstream();

      expect(replaceSpy).toHaveBeenCalledWith(info!.mediaStreamTrack);
    });

    it('setTrackMuted() mutes all simulcast codec tracks', async () => {
      const info1 = track.addSimulcastTrack('vp9');
      const info2 = track.addSimulcastTrack('h264');

      await track.mute();

      expect(info1!.mediaStreamTrack.enabled).toBe(false);
      expect(info2!.mediaStreamTrack.enabled).toBe(false);
    });
  });

  describe('mute() / unmute() Video-Specific Behavior', () => {
    it('mute() stops camera track when source is Camera (non-user-provided)', async () => {
      track = new LocalVideoTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        undefined,
        false,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      track.source = Track.Source.Camera;
      const stopSpy = vi.spyOn(mockMediaStreamTrack, 'stop');

      await track.mute();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('mute() doesn\'t stop camera track when user-provided', async () => {
      track = new LocalVideoTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        undefined,
        true,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      track.source = Track.Source.Camera;
      const stopSpy = vi.spyOn(mockMediaStreamTrack, 'stop');

      await track.mute();

      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('mute() doesn\'t stop non-camera tracks', async () => {
      track = new LocalVideoTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        undefined,
        false,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      track.source = Track.Source.ScreenShare;
      const stopSpy = vi.spyOn(mockMediaStreamTrack, 'stop');

      await track.mute();

      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('mute() returns early if already muted', async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));

      await track.mute();
      const stopSpy = vi.spyOn(mockMediaStreamTrack, 'stop');

      await track.mute();

      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('unmute() restarts camera track when source is Camera (non-user-provided)', async () => {
      track = new LocalVideoTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        undefined,
        false,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      track.source = Track.Source.Camera;
      await track.mute();

      const restartSpy = vi.spyOn(track, 'restartTrack');
      await track.unmute();

      expect(restartSpy).toHaveBeenCalled();
    });

    it('unmute() doesn\'t restart when user-provided', async () => {
      track = new LocalVideoTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        undefined,
        true,
      );
      await new Promise((resolve) => setTimeout(resolve, 10));

      track.source = Track.Source.Camera;
      await track.mute();

      const restartSpy = vi.spyOn(track, 'restartTrack');
      await track.unmute();

      expect(restartSpy).not.toHaveBeenCalled();
    });

    it('unmute() returns early if already unmuted', async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const restartSpy = vi.spyOn(track, 'restartTrack');
      await track.unmute();

      expect(restartSpy).not.toHaveBeenCalled();
    });

    it('setTrackMuted() updates all simulcast tracks', async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const info = track.addSimulcastTrack('vp9');
      await track.mute();

      expect(mockMediaStreamTrack.enabled).toBe(false);
      expect(info!.mediaStreamTrack.enabled).toBe(false);
    });
  });

  describe('Stats & Monitoring', () => {
    beforeEach(async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('startMonitor() sets up interval', () => {
      track.startMonitor(mockSignalClient as any);
      expect((track as any).monitorInterval).toBeDefined();
    });

    it('startMonitor() saves signal client', () => {
      track.startMonitor(mockSignalClient as any);
      expect((track as any).signalClient).toBe(mockSignalClient);
    });

    it('startMonitor() captures initial encodings', () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      (track as any)._sender = sender;

      track.startMonitor(mockSignalClient as any);

      expect((track as any).encodings).toBeDefined();
      expect((track as any).encodings).toHaveLength(1);
    });

    it('startMonitor() doesn\'t create duplicate intervals', () => {
      track.startMonitor(mockSignalClient as any);
      const interval1 = (track as any).monitorInterval;

      track.startMonitor(mockSignalClient as any);
      const interval2 = (track as any).monitorInterval;

      expect(interval1).toBe(interval2);
    });

    it('getSenderStats() returns array of VideoSenderStats', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      (track as any)._sender = sender;

      const stats = await track.getSenderStats();

      expect(Array.isArray(stats)).toBe(true);
      expect(stats.length).toBeGreaterThan(0);
    });

    it('getSenderStats() includes RTP stats', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      (track as any)._sender = sender;

      const stats = await track.getSenderStats();

      expect(stats[0]).toMatchObject({
        type: 'video',
        frameWidth: expect.any(Number),
        frameHeight: expect.any(Number),
        framesPerSecond: expect.any(Number),
      });
    });

    it('getSenderStats() includes quality limitation stats', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      (track as any)._sender = sender;

      const stats = await track.getSenderStats();

      expect(stats[0]).toHaveProperty('qualityLimitationReason');
      expect(stats[0]).toHaveProperty('qualityLimitationDurations');
    });

    it('getSenderStats() sorts by frameWidth descending', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
        { active: true, rid: 'h' },
        { active: true, rid: 'q' },
      ]);
      (track as any)._sender = sender;

      const stats = await track.getSenderStats();

      expect(stats[0].frameWidth).toBeGreaterThanOrEqual(stats[1].frameWidth!);
      expect(stats[1].frameWidth).toBeGreaterThanOrEqual(stats[2].frameWidth!);
    });

    it('monitorSender() computes total bitrate across all layers', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
        { active: true, rid: 'h' },
      ]);
      (track as any)._sender = sender;

      await (track as any).monitorSender();
      await new Promise((resolve) => setTimeout(resolve, 10));
      await (track as any).monitorSender();

      expect(track.currentBitrate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Quality Management', () => {
    beforeEach(async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
        { active: true, rid: 'h' },
        { active: true, rid: 'q' },
      ]);
      (track as any)._sender = sender;
      (track as any).encodings = sender.getParameters().encodings;
    });

    it('setPublishingQuality() creates quality array for all layers', () => {
      const setPublishingLayersSpy = vi.spyOn(track as any, 'setPublishingLayers');
      track.setPublishingQuality(VideoQuality.MEDIUM);

      expect(setPublishingLayersSpy).toHaveBeenCalled();
      const qualities = setPublishingLayersSpy.mock.calls[0][1];
      expect(qualities).toHaveLength(3);
    });

    it('setPublishingQuality() enables qualities up to maxQuality', () => {
      const setPublishingLayersSpy = vi.spyOn(track as any, 'setPublishingLayers');
      track.setPublishingQuality(VideoQuality.MEDIUM);

      const qualities = setPublishingLayersSpy.mock.calls[0][1];
      const lowQuality = qualities.find((q: any) => q.quality === VideoQuality.LOW);
      const mediumQuality = qualities.find((q: any) => q.quality === VideoQuality.MEDIUM);

      expect(lowQuality.enabled).toBe(true);
      expect(mediumQuality.enabled).toBe(true);
    });

    it('setPublishingQuality() disables qualities above maxQuality', () => {
      const setPublishingLayersSpy = vi.spyOn(track as any, 'setPublishingLayers');
      track.setPublishingQuality(VideoQuality.MEDIUM);

      const qualities = setPublishingLayersSpy.mock.calls[0][1];
      const highQuality = qualities.find((q: any) => q.quality === VideoQuality.HIGH);

      expect(highQuality.enabled).toBe(false);
    });

    it('setPublishingLayers() updates sender encodings', async () => {
      const qualities = [
        new SubscribedQuality({ quality: VideoQuality.LOW, enabled: true }),
        new SubscribedQuality({ quality: VideoQuality.MEDIUM, enabled: true }),
        new SubscribedQuality({ quality: VideoQuality.HIGH, enabled: false }),
      ];

      await track.setPublishingLayers(false, qualities);

      const params = (track as any)._sender.getParameters();
      expect(params.encodings).toBeDefined();
    });

    it('setPublishingLayers() skips when optimizeForPerformance is true', async () => {
      (track as any).optimizeForPerformance = true;
      const setParamsSpy = vi.spyOn((track as any)._sender, 'setParameters');

      const qualities = [new SubscribedQuality({ quality: VideoQuality.LOW, enabled: true })];
      await track.setPublishingLayers(false, qualities);

      expect(setParamsSpy).not.toHaveBeenCalled();
    });

    it.skip('setPublishingCodecs() returns new codecs to publish', async () => {
      // Skip: Requires full SignalClient and codec negotiation mocking
      const codecs = [
        new SubscribedCodec({
          codec: 'vp9',
          qualities: [new SubscribedQuality({ quality: VideoQuality.HIGH, enabled: true })],
        }),
      ];

      const newCodecs = await track.setPublishingCodecs(codecs);

      expect(newCodecs).toContain('vp9');
    });

    it.skip('setPublishingCodecs() stores subscribed codecs', async () => {
      // Skip: Requires full SignalClient and codec negotiation mocking
      const codecs = [
        new SubscribedCodec({
          codec: 'vp8',
          qualities: [new SubscribedQuality({ quality: VideoQuality.HIGH, enabled: true })],
        }),
      ];

      await track.setPublishingCodecs(codecs);

      expect((track as any).subscribedCodecs).toBe(codecs);
    });
  });

  describe('Degradation Preference', () => {
    beforeEach(async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('setDegradationPreference() updates preference property', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;

      await track.setDegradationPreference('maintain-framerate');

      expect((track as any).degradationPreference).toBe('maintain-framerate');
    });

    it('setDegradationPreference() sets parameters on sender', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;
      const setParamsSpy = vi.spyOn(sender, 'setParameters');

      await track.setDegradationPreference('maintain-resolution');

      expect(setParamsSpy).toHaveBeenCalled();
    });

    it('setDegradationPreference() handles errors gracefully', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      vi.spyOn(sender, 'setParameters').mockRejectedValue(new Error('Test error'));
      (track as any)._sender = sender;

      await expect(track.setDegradationPreference('balanced')).resolves.not.toThrow();
    });

    it('setter applies degradation preference automatically', () => {
      const setDegradationSpy = vi.spyOn(track, 'setDegradationPreference');
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);

      track.sender = sender as unknown as RTCRtpSender;

      expect(setDegradationSpy).toHaveBeenCalled();
    });

    it('degradation preference defaults to balanced', () => {
      expect((track as any).degradationPreference).toBe('balanced');
    });
  });

  describe('Performance Optimization', () => {
    beforeEach(async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('prioritizePerformance() throws if no sender', async () => {
      await expect(track.prioritizePerformance()).rejects.toThrow('sender not found');
    });

    it('prioritizePerformance() sets optimizeForPerformance flag', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
        { active: true, rid: 'h' },
      ]);
      (track as any)._sender = sender;

      await track.prioritizePerformance();

      expect((track as any).optimizeForPerformance).toBe(true);
    });

    it('prioritizePerformance() disables all but first encoding', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
        { active: true, rid: 'h' },
        { active: true, rid: 'q' },
      ]);
      (track as any)._sender = sender;

      await track.prioritizePerformance();

      const params = sender.getParameters();
      expect(params.encodings[0].active).toBe(true);
      expect(params.encodings[1].active).toBe(false);
      expect(params.encodings[2].active).toBe(false);
    });

    it('prioritizePerformance() scales resolution based on track settings', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      (track as any)._sender = sender;

      await track.prioritizePerformance();

      const params = sender.getParameters();
      expect(params.encodings[0].scaleResolutionDownBy).toBeGreaterThanOrEqual(1);
    });

    it('prioritizePerformance() sets maxFramerate to 15 for first encoding', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      (track as any)._sender = sender;

      await track.prioritizePerformance();

      const params = sender.getParameters();
      expect(params.encodings[0].maxFramerate).toBe(15);
    });

    it('prioritizePerformance() handles errors and resets flag', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      vi.spyOn(sender, 'setParameters').mockRejectedValue(new Error('Test error'));
      (track as any)._sender = sender;

      await track.prioritizePerformance();

      expect((track as any).optimizeForPerformance).toBe(false);
    });
  });

  describe('CPU Constraint Detection', () => {
    beforeEach(async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('detects CPU constraint from quality limitation stats', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      (track as any)._sender = sender;

      // Mock stats with CPU constraint
      vi.spyOn(track, 'getSenderStats').mockResolvedValue([
        {
          type: 'video',
          streamId: 'test',
          frameWidth: 1280,
          frameHeight: 720,
          qualityLimitationReason: 'cpu',
          timestamp: Date.now(),
          bytesSent: 1000,
          packetsSent: 10,
          framesSent: 100,
          framesPerSecond: 30,
          firCount: 0,
          pliCount: 0,
          nackCount: 0,
          rid: 'f',
        } as any,
      ]);

      await (track as any).monitorSender();

      expect((track as any).isCpuConstrained).toBe(true);
    });

    it('emits CpuConstrained event when constraint detected', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      (track as any)._sender = sender;

      const eventHandler = vi.fn();
      track.on(TrackEvent.CpuConstrained, eventHandler);

      vi.spyOn(track, 'getSenderStats').mockResolvedValue([
        {
          type: 'video',
          streamId: 'test',
          qualityLimitationReason: 'cpu',
          timestamp: Date.now(),
          bytesSent: 1000,
          packetsSent: 10,
          rid: 'f',
        } as any,
      ]);

      await (track as any).monitorSender();

      expect(eventHandler).toHaveBeenCalled();
    });

    it('doesn\'t emit event if already constrained', async () => {
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack, [
        { active: true, rid: 'f' },
      ]);
      (track as any)._sender = sender;
      (track as any).isCpuConstrained = true;

      const eventHandler = vi.fn();
      track.on(TrackEvent.CpuConstrained, eventHandler);

      vi.spyOn(track, 'getSenderStats').mockResolvedValue([
        {
          type: 'video',
          streamId: 'test',
          qualityLimitationReason: 'cpu',
          timestamp: Date.now(),
          bytesSent: 1000,
          packetsSent: 10,
          rid: 'f',
        } as any,
      ]);

      await (track as any).monitorSender();

      expect(eventHandler).not.toHaveBeenCalled();
    });

    it('resets isCpuConstrained on track restart', async () => {
      (track as any).isCpuConstrained = true;

      await track.restartTrack();

      expect((track as any).isCpuConstrained).toBe(false);
    });
  });

  describe('Track Restart & Processor', () => {
    beforeEach(async () => {
      track = new LocalVideoTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('restartTrack() accepts VideoCaptureOptions', async () => {
      const restartSpy = vi.spyOn(track as any, 'restart');
      await track.restartTrack({ resolution: { width: 1920, height: 1080 } });
      expect(restartSpy).toHaveBeenCalled();
    });

    it('restartTrack() clones track for all simulcast codecs', async () => {
      const info = track.addSimulcastTrack('vp9');
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      info!.sender = sender as unknown as RTCRtpSender;

      const cloneSpy = vi.spyOn(track.mediaStreamTrack, 'clone');
      await track.restartTrack();

      expect(cloneSpy).toHaveBeenCalled();
    });

    it('setProcessor() updates all simulcast codec senders', async () => {
      const info = track.addSimulcastTrack('vp9');
      const sender = new MockRTCRtpSender(mockMediaStreamTrack as unknown as MediaStreamTrack);
      info!.sender = sender as unknown as RTCRtpSender;

      const processedTrack = new EnhancedMockMediaStreamTrack('video');
      const mockProcessor = {
        init: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
        processedTrack: processedTrack as unknown as MediaStreamTrack,
        restart: vi.fn(),
        name: 'test-processor',
      };

      const replaceSpy = vi.spyOn(sender, 'replaceTrack');
      await track.setProcessor(mockProcessor as any);

      expect(replaceSpy).toHaveBeenCalledWith(processedTrack);
    });
  });
});

describe('Helper Functions', () => {
  describe('videoQualityForRid', () => {
    it('returns HIGH for "f"', () => {
      expect(videoQualityForRid('f')).toBe(VideoQuality.HIGH);
    });

    it('returns MEDIUM for "h"', () => {
      expect(videoQualityForRid('h')).toBe(VideoQuality.MEDIUM);
    });

    it('returns LOW for "q"', () => {
      expect(videoQualityForRid('q')).toBe(VideoQuality.LOW);
    });

    it('returns HIGH for unknown', () => {
      expect(videoQualityForRid('unknown')).toBe(VideoQuality.HIGH);
    });
  });

  describe('videoLayersFromEncodings', () => {
    it('returns single layer for no encoding', () => {
      const layers = videoLayersFromEncodings(640, 360);
      expect(layers).toHaveLength(1);
      expect(layers[0].quality).toBe(VideoQuality.HIGH);
      expect(layers[0].width).toBe(640);
      expect(layers[0].height).toBe(360);
    });

    it('returns single layer for explicit encoding', () => {
      const layers = videoLayersFromEncodings(640, 360, [
        {
          maxBitrate: 200_000,
        },
      ]);
      expect(layers).toHaveLength(1);
      expect(layers[0].quality).toBe(VideoQuality.HIGH);
      expect(layers[0].bitrate).toBe(200_000);
    });

    it('returns three layers for simulcast', () => {
      const layers = videoLayersFromEncodings(1280, 720, [
        {
          scaleResolutionDownBy: 4,
          rid: 'q',
          maxBitrate: 125_000,
        },
        {
          scaleResolutionDownBy: 2,
          rid: 'h',
          maxBitrate: 500_000,
        },
        {
          rid: 'f',
          maxBitrate: 1_200_000,
        },
      ]);

      expect(layers).toHaveLength(3);
      expect(layers[0].quality).toBe(VideoQuality.LOW);
      expect(layers[0].width).toBe(320);
      expect(layers[2].quality).toBe(VideoQuality.HIGH);
      expect(layers[2].height).toBe(720);
    });

    it('returns qualities starting from lowest for SVC', () => {
      const layers = videoLayersFromEncodings(
        1280,
        720,
        [
          {
            /** @ts-ignore */
            scalabilityMode: 'L2T2',
          },
        ],
        true,
      );

      expect(layers).toHaveLength(2);
      expect(layers[0].quality).toBe(VideoQuality.MEDIUM);
      expect(layers[0].width).toBe(1280);
      expect(layers[1].quality).toBe(VideoQuality.LOW);
      expect(layers[1].width).toBe(640);
    });

    it('returns qualities starting from lowest for SVC (three layers)', () => {
      const layers = videoLayersFromEncodings(
        1280,
        720,
        [
          {
            /** @ts-ignore */
            scalabilityMode: 'L3T3',
          },
        ],
        true,
      );

      expect(layers).toHaveLength(3);
      expect(layers[0].quality).toBe(VideoQuality.HIGH);
      expect(layers[0].width).toBe(1280);
      expect(layers[1].quality).toBe(VideoQuality.MEDIUM);
      expect(layers[1].width).toBe(640);
      expect(layers[2].quality).toBe(VideoQuality.LOW);
      expect(layers[2].width).toBe(320);
    });

    it('returns qualities starting from lowest for SVC (single layer)', () => {
      const layers = videoLayersFromEncodings(
        1280,
        720,
        [
          {
            /** @ts-ignore */
            scalabilityMode: 'L1T2',
          },
        ],
        true,
      );

      expect(layers).toHaveLength(1);
      expect(layers[0].quality).toBe(VideoQuality.LOW);
      expect(layers[0].width).toBe(1280);
    });

    it('handles portrait', () => {
      const layers = videoLayersFromEncodings(720, 1280, [
        {
          scaleResolutionDownBy: 4,
          rid: 'q',
          maxBitrate: 125_000,
        },
        {
          scaleResolutionDownBy: 2,
          rid: 'h',
          maxBitrate: 500_000,
        },
        {
          rid: 'f',
          maxBitrate: 1_200_000,
        },
      ]);
      expect(layers).toHaveLength(3);
      expect(layers[0].quality).toBe(VideoQuality.LOW);
      expect(layers[0].height).toBe(320);
      expect(layers[2].quality).toBe(VideoQuality.HIGH);
      expect(layers[2].width).toBe(720);
    });
  });
});
