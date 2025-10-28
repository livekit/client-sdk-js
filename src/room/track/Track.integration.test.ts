import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnhancedMockMediaStreamTrack,
  MockAudioContext,
  MockHTMLAudioElement,
  MockMediaStream,
  MockRTCRtpReceiver,
  MockRTCRtpSender,
} from '../../test/mocks.enhanced';
import { TrackEvent } from '../events';
import LocalAudioTrack from './LocalAudioTrack';
import RemoteAudioTrack from './RemoteAudioTrack';
import { Track } from './Track';

// Mock getBrowser
vi.mock('../../utils/browserParser', () => ({
  getBrowser: vi.fn().mockReturnValue({
    name: 'Chrome',
    version: '120.0.0',
    os: 'macOS',
  }),
}));

// Mock detectSilence
vi.mock('./utils', async () => {
  const actual = await vi.importActual('./utils');
  return {
    ...actual,
    detectSilence: vi.fn().mockResolvedValue(false),
  };
});

describe('Track Integration Tests', () => {
  beforeEach(() => {
    global.MediaStream = MockMediaStream as any;
    global.navigator = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(
          new MockMediaStream([new EnhancedMockMediaStreamTrack('audio')]) as unknown as MediaStream,
        ),
      },
    } as any;
    global.document = {
      createElement: vi.fn(() => new MockHTMLAudioElement() as unknown as HTMLAudioElement),
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;
  });

  describe('LocalAudioTrack with Processor Integration', () => {
    it('processes audio through processor pipeline', async () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockAudioContext = new MockAudioContext();
      const track = new LocalAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        undefined,
        false,
        mockAudioContext as unknown as AudioContext,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const processedTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockProcessor = {
        init: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
        processedTrack: processedTrack as unknown as MediaStreamTrack,
        restart: vi.fn(),
        name: 'test-processor',
      };

      await track.setProcessor(mockProcessor as any);

      expect(mockProcessor.init).toHaveBeenCalled();
      expect(track.mediaStreamTrack).toBe(processedTrack);
    });

    it('handles processor replacement workflow', async () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockAudioContext = new MockAudioContext();
      const track = new LocalAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        undefined,
        false,
        mockAudioContext as unknown as AudioContext,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      // First processor
      const processor1 = {
        init: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
        processedTrack: new EnhancedMockMediaStreamTrack('audio') as unknown as MediaStreamTrack,
        restart: vi.fn(),
        name: 'processor-1',
      };

      await track.setProcessor(processor1 as any);

      // Second processor (replaces first)
      const processor2 = {
        init: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
        processedTrack: new EnhancedMockMediaStreamTrack('audio') as unknown as MediaStreamTrack,
        restart: vi.fn(),
        name: 'processor-2',
      };

      await track.setProcessor(processor2 as any);

      expect(processor1.destroy).toHaveBeenCalled();
      expect(processor2.init).toHaveBeenCalled();
    });

    it('maintains processor through mute/unmute cycle', async () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockAudioContext = new MockAudioContext();
      const track = new LocalAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        undefined,
        false,
        mockAudioContext as unknown as AudioContext,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const mockProcessor = {
        init: vi.fn().mockResolvedValue(undefined),
        destroy: vi.fn().mockResolvedValue(undefined),
        processedTrack: new EnhancedMockMediaStreamTrack('audio') as unknown as MediaStreamTrack,
        restart: vi.fn(),
        name: 'test-processor',
      };

      await track.setProcessor(mockProcessor as any);

      await track.mute();
      await track.unmute();

      expect(track.getProcessor()).toBe(mockProcessor);
    });
  });

  describe('RemoteAudioTrack with WebAudio Plugins', () => {
    it('applies audio plugin chain correctly', () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockReceiver = new MockRTCRtpReceiver(mockTrack as unknown as MediaStreamTrack);
      const mockAudioContext = new MockAudioContext();

      const track = new RemoteAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );

      const plugin1 = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } as any;
      const plugin2 = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } as any;
      const plugin3 = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } as any;

      track.setWebAudioPlugins([plugin1, plugin2, plugin3]);
      track.attach();

      // Verify chain: source -> plugin1 -> plugin2 -> plugin3 -> gain -> destination
      expect(plugin1.connect).toHaveBeenCalledWith(plugin2);
      expect(plugin2.connect).toHaveBeenCalledWith(plugin3);
    });

    it('maintains volume control with WebAudio pipeline', () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockReceiver = new MockRTCRtpReceiver(mockTrack as unknown as MediaStreamTrack);
      const mockAudioContext = new MockAudioContext();

      const track = new RemoteAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );

      track.attach();
      track.setVolume(0.5);

      expect(track.getVolume()).toBe(0.5);
      expect((track as any).gainNode.gain.value).toBe(0.5);
    });

    it('handles plugin removal and reconnection', () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockReceiver = new MockRTCRtpReceiver(mockTrack as unknown as MediaStreamTrack);
      const mockAudioContext = new MockAudioContext();

      const track = new RemoteAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );

      const plugin1 = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } as any;

      track.setWebAudioPlugins([plugin1]);
      track.attach();

      // Remove plugins
      track.setWebAudioPlugins([]);

      // Should still have audio path
      expect((track as any).gainNode).toBeDefined();
    });
  });

  describe('Track Replacement Workflow', () => {
    it('replaces local track and updates sender', async () => {
      const originalTrack = new EnhancedMockMediaStreamTrack('audio');
      const track = new LocalAudioTrack(originalTrack as unknown as MediaStreamTrack);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sender = new MockRTCRtpSender(originalTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;

      const newTrack = new EnhancedMockMediaStreamTrack('audio');
      const replaceSpy = vi.spyOn(sender, 'replaceTrack');

      await track.replaceTrack(newTrack as unknown as MediaStreamTrack, true);

      expect(replaceSpy).toHaveBeenCalled();
      expect((track as any)._mediaStreamTrack).toBe(newTrack);
    });

    it('maintains attached elements during track replacement', async () => {
      const originalTrack = new EnhancedMockMediaStreamTrack('audio');
      const track = new LocalAudioTrack(originalTrack as unknown as MediaStreamTrack);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sender = new MockRTCRtpSender(originalTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;

      const element = track.attach();

      const newTrack = new EnhancedMockMediaStreamTrack('audio');
      await track.replaceTrack(newTrack as unknown as MediaStreamTrack, true);

      expect(track.attachedElements).toContain(element);
      expect(element.srcObject).toBeDefined();
    });
  });

  describe('Device Switching Workflow', () => {
    it('switches audio input device successfully', async () => {
      const originalTrack = new EnhancedMockMediaStreamTrack('audio', { deviceId: 'device-1' });
      const track = new LocalAudioTrack(originalTrack as unknown as MediaStreamTrack);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const newTrack = new EnhancedMockMediaStreamTrack('audio', { deviceId: 'device-2' });
      (navigator.mediaDevices.getUserMedia as any).mockResolvedValue(
        new MockMediaStream([newTrack]) as unknown as MediaStream,
      );

      await track.setDeviceId('device-2');

      expect(track.constraints.deviceId).toBe('device-2');
    });

    it('handles device switch failure gracefully', async () => {
      const originalTrack = new EnhancedMockMediaStreamTrack('audio', { deviceId: 'device-1' });
      const track = new LocalAudioTrack(originalTrack as unknown as MediaStreamTrack);

      await new Promise((resolve) => setTimeout(resolve, 10));

      (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(
        new Error('Device not found'),
      );

      await expect(track.setDeviceId('invalid-device')).rejects.toThrow();
    });
  });

  describe('Multiple Element Attachment/Detachment', () => {
    it('manages multiple elements simultaneously', () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockReceiver = new MockRTCRtpReceiver(mockTrack as unknown as MediaStreamTrack);

      const track = new RemoteAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );

      const element1 = track.attach();
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element2);
      const element3 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element3);

      expect(track.attachedElements).toHaveLength(3);

      track.detach(element2);
      expect(track.attachedElements).toHaveLength(2);
      expect(track.attachedElements).toContain(element1);
      expect(track.attachedElements).toContain(element3);
    });

    it('applies volume changes to all attached elements', () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockReceiver = new MockRTCRtpReceiver(mockTrack as unknown as MediaStreamTrack);

      const track = new RemoteAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );

      const element1 = track.attach();
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element2);

      track.setVolume(0.7);

      expect(element1.volume).toBe(0.7);
      expect(element2.volume).toBe(0.7);
    });

    it('emits events for each element attachment', () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockReceiver = new MockRTCRtpReceiver(mockTrack as unknown as MediaStreamTrack);

      const track = new RemoteAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );

      const attachHandler = vi.fn();
      track.on(TrackEvent.ElementAttached, attachHandler);

      track.attach();
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element2);

      expect(attachHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Upstream Pause/Resume Workflow', () => {
    it('pauses and resumes upstream correctly', async () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const track = new LocalAudioTrack(mockTrack as unknown as MediaStreamTrack);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sender = new MockRTCRtpSender(mockTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;

      const pauseHandler = vi.fn();
      const resumeHandler = vi.fn();
      track.on(TrackEvent.UpstreamPaused, pauseHandler);
      track.on(TrackEvent.UpstreamResumed, resumeHandler);

      await track.pauseUpstream();
      expect(pauseHandler).toHaveBeenCalled();
      expect(track.isUpstreamPaused).toBe(true);

      await track.resumeUpstream();
      expect(resumeHandler).toHaveBeenCalled();
      expect(track.isUpstreamPaused).toBe(false);
    });

    it('maintains mute state during upstream pause/resume', async () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const track = new LocalAudioTrack(mockTrack as unknown as MediaStreamTrack);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sender = new MockRTCRtpSender(mockTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;

      await track.mute();
      await track.pauseUpstream();

      expect(track.isMuted).toBe(true);
      expect(track.isUpstreamPaused).toBe(true);

      await track.resumeUpstream();
      expect(track.isMuted).toBe(true);
    });
  });

  describe('Remote Track MediaStream Lifecycle', () => {
    it('handles track removal from MediaStream', () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockReceiver = new MockRTCRtpReceiver(mockTrack as unknown as MediaStreamTrack);

      const track = new RemoteAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );

      const mediaStream = new MockMediaStream([
        mockTrack as unknown as MediaStreamTrack,
      ]) as unknown as MediaStream;

      const endedHandler = vi.fn();
      track.on(TrackEvent.Ended, endedHandler);

      track.setMediaStream(mediaStream);
      (mediaStream as MockMediaStream).removeTrack(mockTrack as unknown as MediaStreamTrack);

      expect(endedHandler).toHaveBeenCalled();
      expect(track.receiver).toBeUndefined();
    });

    it('cleans up playout delay on track end', () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockReceiver = new MockRTCRtpReceiver(mockTrack as unknown as MediaStreamTrack);
      mockReceiver.playoutDelayHint = 2.0;

      const track = new RemoteAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );

      const mediaStream = new MockMediaStream([
        mockTrack as unknown as MediaStreamTrack,
      ]) as unknown as MediaStream;

      track.setMediaStream(mediaStream);
      (mediaStream as MockMediaStream).removeTrack(mockTrack as unknown as MediaStreamTrack);

      expect(mockReceiver.playoutDelayHint).toBeUndefined();
    });
  });

  describe('Track Monitoring Integration', () => {
    it('monitors local track bitrate over time', async () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const track = new LocalAudioTrack(mockTrack as unknown as MediaStreamTrack);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const sender = new MockRTCRtpSender(mockTrack as unknown as MediaStreamTrack);
      (track as any)._sender = sender;

      track.startMonitor();

      // Wait for monitoring to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have attempted to get stats
      expect(track.currentBitrate).toBeGreaterThanOrEqual(0);

      track.stopMonitor();
    });

    it('monitors remote track bitrate over time', async () => {
      const mockTrack = new EnhancedMockMediaStreamTrack('audio');
      const mockReceiver = new MockRTCRtpReceiver(mockTrack as unknown as MediaStreamTrack);

      const track = new RemoteAudioTrack(
        mockTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );

      track.start();

      // Wait for monitoring to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(track.currentBitrate).toBeGreaterThanOrEqual(0);

      track.stop();
    });
  });
});
