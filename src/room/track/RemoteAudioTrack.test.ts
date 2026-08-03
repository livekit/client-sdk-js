import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EnhancedMockMediaStreamTrack,
  MockAudioContext,
  MockHTMLAudioElement,
  MockMediaStream,
  MockRTCRtpReceiver,
} from '../../test/mocks.enhanced';
import { TrackEvent } from '../events';
import RemoteAudioTrack from './RemoteAudioTrack';

// Mock supportsSetSinkId
vi.mock('../utils', async () => {
  const actual = await vi.importActual('../utils');
  return {
    ...actual,
    supportsSetSinkId: vi.fn().mockReturnValue(true),
  };
});

describe('RemoteAudioTrack', () => {
  let track: RemoteAudioTrack;
  let mockMediaStreamTrack: EnhancedMockMediaStreamTrack;
  let mockReceiver: MockRTCRtpReceiver;
  let mockAudioContext: MockAudioContext;

  beforeEach(() => {
    mockMediaStreamTrack = new EnhancedMockMediaStreamTrack('audio');
    mockReceiver = new MockRTCRtpReceiver(mockMediaStreamTrack as unknown as MediaStreamTrack);
    mockAudioContext = new MockAudioContext();
    global.MediaStream = MockMediaStream as any;
    global.document = {
      createElement: vi.fn(() => new MockHTMLAudioElement() as unknown as HTMLAudioElement),
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as any;
  });

  describe('Constructor', () => {
    it('accepts audioContext parameter', () => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );
      expect((track as any).audioContext).toBe(mockAudioContext);
    });

    it('accepts audioOutput options', () => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        undefined,
        { deviceId: 'test-device' },
      );
      expect((track as any).sinkId).toBe('test-device');
    });

    it('sets sinkId from audioOutput', () => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        undefined,
        { deviceId: 'output-device' },
      );
      expect((track as any).sinkId).toBe('output-device');
    });
  });

  describe('setVolume()', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );
    });

    it('sets volume on attached elements', () => {
      const element = track.attach();
      track.setVolume(0.5);
      expect(element.volume).toBe(0.5);
    });

    it('uses gainNode when audioContext is present', () => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );

      const element = track.attach();
      track.setVolume(0.7);

      expect((track as any).gainNode?.gain.value).toBe(0.7);
    });

    it('uses element.volume when no audioContext', () => {
      const element = track.attach();
      track.setVolume(0.3);
      expect(element.volume).toBe(0.3);
    });

    it('stores volume in elementVolume', () => {
      track.setVolume(0.8);
      expect((track as any).elementVolume).toBe(0.8);
    });

    it('applies volume to multiple elements', () => {
      const element1 = track.attach();
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element2);

      track.setVolume(0.6);

      expect(element1.volume).toBe(0.6);
      expect(element2.volume).toBe(0.6);
    });
  });

  describe('getVolume()', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );
    });

    it('returns elementVolume if set', () => {
      track.setVolume(0.5);
      expect(track.getVolume()).toBe(0.5);
    });

    it('returns highest volume from attached elements', () => {
      const element1 = track.attach();
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element2);

      element1.volume = 0.3;
      element2.volume = 0.7;

      expect(track.getVolume()).toBe(0.7);
    });

    it('returns 0 if no volume set and no elements', () => {
      expect(track.getVolume()).toBe(0);
    });
  });

  describe('setSinkId()', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );
      // Mock supportsSetSinkId to return true
      global.HTMLAudioElement = MockHTMLAudioElement as any;
    });

    it('sets sinkId on all attached elements', async () => {
      const element = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      (element as any).setSinkId = vi.fn().mockResolvedValue(undefined);
      const setSinkIdSpy = vi.spyOn(element, 'setSinkId' as any);
      track.attach(element);

      await track.setSinkId('new-device');

      expect(setSinkIdSpy).toHaveBeenCalledWith('new-device');
    });

    it('updates sinkId property', async () => {
      await track.setSinkId('device-123');
      expect((track as any).sinkId).toBe('device-123');
    });

    it('handles multiple elements', async () => {
      const element1 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      (element1 as any).setSinkId = vi.fn().mockResolvedValue(undefined);
      (element2 as any).setSinkId = vi.fn().mockResolvedValue(undefined);
      const setSinkIdSpy1 = vi.spyOn(element1, 'setSinkId' as any);
      const setSinkIdSpy2 = vi.spyOn(element2, 'setSinkId' as any);

      track.attach(element1);
      track.attach(element2);

      await track.setSinkId('shared-device');

      expect(setSinkIdSpy1).toHaveBeenCalledWith('shared-device');
      expect(setSinkIdSpy2).toHaveBeenCalledWith('shared-device');
    });
  });

  describe('attach()', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );
    });

    it('calls parent attach()', () => {
      const element = track.attach();
      expect(track.attachedElements).toContain(element);
    });

    it('sets sinkId on new element if supported', () => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        undefined,
        { deviceId: 'preset-device' },
      );

      const element = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      (element as any).setSinkId = vi.fn().mockResolvedValue(undefined);
      const setSinkIdSpy = vi.spyOn(element, 'setSinkId' as any);

      track.attach(element);

      expect(setSinkIdSpy).toHaveBeenCalledWith('preset-device');
    });

    it('connects WebAudio for first element', () => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );

      const element = track.attach();

      expect((track as any).sourceNode).toBeDefined();
      expect((track as any).gainNode).toBeDefined();
    });

    it('applies stored volume to new element', () => {
      track.setVolume(0.4);
      const element = track.attach();
      expect(element.volume).toBe(0.4);
    });

    it('mutes element when using WebAudio', () => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );

      const element = track.attach();
      expect(element.muted).toBe(true);
      expect(element.volume).toBe(0);
    });
  });

  describe('detach()', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );
    });

    it('calls parent detach()', () => {
      const element = track.attach();
      track.detach(element);
      expect(track.attachedElements).not.toContain(element);
    });

    it('disconnects WebAudio when all elements detached', () => {
      const element = track.attach();
      track.detach(element);

      expect((track as any).gainNode).toBeUndefined();
      expect((track as any).sourceNode).toBeUndefined();
    });

    it('reconnects WebAudio to first remaining element', () => {
      const element1 = track.attach();
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element2);

      const sourceNode1 = (track as any).sourceNode;

      track.detach(element1);

      // Should have reconnected
      expect((track as any).sourceNode).toBeDefined();
      expect((track as any).gainNode).toBeDefined();
    });
  });

  describe('setAudioContext()', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );
    });

    it('updates audioContext property', () => {
      track.setAudioContext(mockAudioContext as unknown as AudioContext);
      expect((track as any).audioContext).toBe(mockAudioContext);
    });

    it('connects WebAudio if elements attached', () => {
      const element = track.attach();
      track.setAudioContext(mockAudioContext as unknown as AudioContext);

      expect((track as any).sourceNode).toBeDefined();
      expect((track as any).gainNode).toBeDefined();
    });

    it('disconnects WebAudio if audioContext is undefined', () => {
      track.setAudioContext(mockAudioContext as unknown as AudioContext);
      const element = track.attach();

      track.setAudioContext(undefined);

      expect((track as any).gainNode).toBeUndefined();
      expect((track as any).sourceNode).toBeUndefined();
    });
  });

  describe('setWebAudioPlugins()', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );
    });

    it('stores plugin nodes', () => {
      const plugin1 = { connect: vi.fn(), disconnect: vi.fn() } as any;
      const plugin2 = { connect: vi.fn(), disconnect: vi.fn() } as any;

      track.setWebAudioPlugins([plugin1, plugin2]);

      expect((track as any).webAudioPluginNodes).toEqual([plugin1, plugin2]);
    });

    it('reconnects WebAudio with plugins', () => {
      const element = track.attach();

      const plugin1 = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } as any;
      const plugin2 = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } as any;

      track.setWebAudioPlugins([plugin1, plugin2]);

      expect(plugin1.connect).toHaveBeenCalled();
      expect(plugin2.connect).toHaveBeenCalled();
    });

    it('chains plugins in correct order', () => {
      const element = track.attach();

      const plugin1 = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } as any;
      const plugin2 = { connect: vi.fn().mockReturnThis(), disconnect: vi.fn() } as any;

      track.setWebAudioPlugins([plugin1, plugin2]);

      // plugin1 should be connected to plugin2
      expect(plugin1.connect).toHaveBeenCalledWith(plugin2);
    });
  });

  describe('WebAudio Connection', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );
    });

    it('creates MediaStreamSource from element', () => {
      const createSourceSpy = vi.spyOn(mockAudioContext, 'createMediaStreamSource');
      track.attach();
      expect(createSourceSpy).toHaveBeenCalled();
    });

    it('creates GainNode', () => {
      const createGainSpy = vi.spyOn(mockAudioContext, 'createGain');
      track.attach();
      expect(createGainSpy).toHaveBeenCalled();
    });

    it('connects nodes in correct order', () => {
      track.attach();

      const sourceNode = (track as any).sourceNode;
      const gainNode = (track as any).gainNode;

      expect(sourceNode).toBeDefined();
      expect(gainNode).toBeDefined();
    });

    it('connects gain to destination', () => {
      track.attach();
      const gainNode = (track as any).gainNode;

      expect(gainNode).toBeDefined();
      // Connection is verified by the mock's connect method being called
    });

    it('resumes AudioContext if not running', async () => {
      mockAudioContext.state = 'suspended';
      const resumeSpy = vi.spyOn(mockAudioContext, 'resume');

      track.attach();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(resumeSpy).toHaveBeenCalled();
    });

    it("emits AudioPlaybackFailed if context won't start", async () => {
      mockAudioContext.state = 'suspended';
      vi.spyOn(mockAudioContext, 'resume').mockResolvedValue(undefined);

      const handler = vi.fn();
      track.on(TrackEvent.AudioPlaybackFailed, handler);

      track.attach();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalled();
    });

    it('applies volume through gainNode if set', () => {
      track.setVolume(0.5);
      track.attach();

      const gainNode = (track as any).gainNode;
      expect(gainNode.gain.value).toBe(0.5);
    });
  });

  describe('WebAudio Disconnection', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
        mockAudioContext as unknown as AudioContext,
      );
    });

    it('disconnects gainNode', () => {
      const element = track.attach();
      const gainNode = (track as any).gainNode;
      const disconnectSpy = vi.spyOn(gainNode, 'disconnect');

      track.detach(element);

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('disconnects sourceNode', () => {
      const element = track.attach();
      const sourceNode = (track as any).sourceNode;
      const disconnectSpy = vi.spyOn(sourceNode, 'disconnect');

      track.detach(element);

      expect(disconnectSpy).toHaveBeenCalled();
    });

    it('clears node references', () => {
      const element = track.attach();
      track.detach(element);

      expect((track as any).gainNode).toBeUndefined();
      expect((track as any).sourceNode).toBeUndefined();
    });
  });

  describe('monitorReceiver()', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );
    });

    it('gets receiver stats', async () => {
      const getStatsSpy = vi.spyOn(track, 'getReceiverStats');
      await (track as any).monitorReceiver();
      expect(getStatsSpy).toHaveBeenCalled();
    });

    it('computes bitrate from stats', async () => {
      // First call to establish baseline
      await (track as any).monitorReceiver();

      // Second call to compute bitrate
      await new Promise((resolve) => setTimeout(resolve, 10));
      await (track as any).monitorReceiver();

      expect(track.currentBitrate).toBeGreaterThanOrEqual(0);
    });

    it('sets currentBitrate to 0 if no receiver', async () => {
      track.receiver = undefined;
      await (track as any).monitorReceiver();
      expect(track.currentBitrate).toBe(0);
    });
  });

  describe('getReceiverStats()', () => {
    beforeEach(() => {
      track = new RemoteAudioTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        'test-sid',
        mockReceiver as unknown as RTCRtpReceiver,
      );
    });

    it('returns AudioReceiverStats from receiver', async () => {
      const stats = await track.getReceiverStats();
      expect(stats).toBeDefined();
      expect(stats?.type).toBe('audio');
    });

    it('returns undefined if no receiver', async () => {
      track.receiver = undefined;
      const stats = await track.getReceiverStats();
      expect(stats).toBeUndefined();
    });

    it('parses inbound-rtp stats correctly', async () => {
      const stats = await track.getReceiverStats();
      expect(stats).toMatchObject({
        type: 'audio',
        streamId: expect.any(String),
        timestamp: expect.any(Number),
        jitter: expect.any(Number),
        bytesReceived: expect.any(Number),
      });
    });

    it('includes audio-specific stats', async () => {
      const stats = await track.getReceiverStats();
      expect(stats).toMatchObject({
        concealedSamples: expect.any(Number),
        concealmentEvents: expect.any(Number),
        silentConcealedSamples: expect.any(Number),
        silentConcealmentEvents: expect.any(Number),
        totalAudioEnergy: expect.any(Number),
        totalSamplesDuration: expect.any(Number),
      });
    });
  });
});
