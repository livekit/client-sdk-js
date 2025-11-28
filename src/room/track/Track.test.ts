import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackEvent } from '../events';
import {
  EnhancedMockMediaStreamTrack,
  MockHTMLAudioElement,
  MockHTMLVideoElement,
  MockMediaStream,
} from '../../test/mocks.enhanced';
import { Track, attachToElement, detachTrack } from './Track';

// Create a concrete implementation for testing
class TestTrack extends Track<Track.Kind.Audio> {
  constructor(
    mediaTrack: MediaStreamTrack,
    kind: Track.Kind = Track.Kind.Audio,
    loggerOptions = {},
  ) {
    super(mediaTrack, kind, loggerOptions);
  }

  get isLocal(): boolean {
    return false;
  }

  startMonitor(): void {}
}

describe('Track', () => {
  let track: TestTrack;
  let mockMediaStreamTrack: EnhancedMockMediaStreamTrack;

  beforeEach(() => {
    mockMediaStreamTrack = new EnhancedMockMediaStreamTrack('audio');
    track = new TestTrack(mockMediaStreamTrack as unknown as MediaStreamTrack);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor & Initialization', () => {
    it('creates track with correct kind (audio)', () => {
      const audioTrack = new TestTrack(
        mockMediaStreamTrack as unknown as MediaStreamTrack,
        Track.Kind.Audio,
      );
      expect(audioTrack.kind).toBe(Track.Kind.Audio);
    });

    it('creates track with correct kind (video)', () => {
      const videoMediaTrack = new EnhancedMockMediaStreamTrack('video');
      const videoTrack = new TestTrack(
        videoMediaTrack as unknown as MediaStreamTrack,
        Track.Kind.Video,
      );
      expect(videoTrack.kind).toBe(Track.Kind.Video);
    });

    it('sets mediaStreamTrack correctly', () => {
      expect(track.mediaStreamTrack).toBe(mockMediaStreamTrack);
    });

    it('initializes with correct default values', () => {
      expect(track.isMuted).toBe(false);
      expect(track.streamState).toBe(Track.StreamState.Active);
      expect(track.attachedElements).toEqual([]);
    });

    it('sets source to Unknown by default', () => {
      expect(track.source).toBe(Track.Source.Unknown);
    });
  });

  describe('attach() Method', () => {
    beforeEach(() => {
      // Mock document.createElement
      global.document = {
        createElement: vi.fn((tag: string) => {
          if (tag === 'audio') {
            return new MockHTMLAudioElement() as unknown as HTMLAudioElement;
          } else if (tag === 'video') {
            return new MockHTMLVideoElement() as unknown as HTMLVideoElement;
          }
          throw new Error(`Unexpected tag: ${tag}`);
        }),
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as any;

      global.MediaStream = MockMediaStream as any;
    });

    it('creates new HTMLAudioElement when no element provided (audio track)', () => {
      const element = track.attach();
      expect(element).toBeDefined();
      expect(track.attachedElements).toContain(element);
    });

    it('creates new HTMLVideoElement when no element provided (video track)', () => {
      const videoMediaTrack = new EnhancedMockMediaStreamTrack('video');
      const videoTrack = new TestTrack(
        videoMediaTrack as unknown as MediaStreamTrack,
        Track.Kind.Video,
      );
      const element = videoTrack.attach();
      expect(element).toBeDefined();
      expect(videoTrack.attachedElements).toContain(element);
    });

    it('adds element to attachedElements array', () => {
      const element = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element);
      expect(track.attachedElements).toContain(element);
    });

    it('sets srcObject on element', () => {
      const element = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element);
      expect(element.srcObject).toBeInstanceOf(MockMediaStream);
    });

    it('emits AudioPlaybackStarted event on successful audio playback', async () => {
      const element = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      const eventPromise = new Promise((resolve) => {
        track.once(TrackEvent.AudioPlaybackStarted, resolve);
      });

      track.attach(element);
      await eventPromise;
    });

    it('emits AudioPlaybackFailed event when autoplay blocked for audio', async () => {
      const element = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      (element as any).setPlayBehavior('not-allowed');

      const eventPromise = new Promise((resolve) => {
        track.once(TrackEvent.AudioPlaybackFailed, resolve);
      });

      track.attach(element);
      await eventPromise;
    });

    it('emits VideoPlaybackStarted event on successful video playback', async () => {
      const videoMediaTrack = new EnhancedMockMediaStreamTrack('video');
      const videoTrack = new TestTrack(
        videoMediaTrack as unknown as MediaStreamTrack,
        Track.Kind.Video,
      );
      const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;

      const eventPromise = new Promise((resolve) => {
        videoTrack.once(TrackEvent.VideoPlaybackStarted, resolve);
      });

      videoTrack.attach(element);
      await eventPromise;
    });

    it('emits VideoPlaybackFailed event when autoplay blocked for video', async () => {
      const videoMediaTrack = new EnhancedMockMediaStreamTrack('video');
      const videoTrack = new TestTrack(
        videoMediaTrack as unknown as MediaStreamTrack,
        Track.Kind.Video,
      );
      const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
      (element as any).setPlayBehavior('not-allowed');

      const eventPromise = new Promise((resolve) => {
        videoTrack.once(TrackEvent.VideoPlaybackFailed, resolve);
      });

      videoTrack.attach(element);
      await eventPromise;
    });

    it('emits ElementAttached event', () => {
      const element = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      const eventHandler = vi.fn();
      track.on(TrackEvent.ElementAttached, eventHandler);

      track.attach(element);

      expect(eventHandler).toHaveBeenCalledWith(element);
    });

    it('does not duplicate elements in attachedElements', () => {
      const element = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element);
      track.attach(element);
      expect(track.attachedElements.filter((e) => e === element)).toHaveLength(1);
    });
  });

  describe('detach() Method', () => {
    beforeEach(() => {
      global.document = {
        createElement: vi.fn((tag: string) => {
          if (tag === 'audio') {
            return new MockHTMLAudioElement() as unknown as HTMLAudioElement;
          }
          return new MockHTMLVideoElement() as unknown as HTMLVideoElement;
        }),
        visibilityState: 'visible',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as any;
      global.MediaStream = MockMediaStream as any;
    });

    it('removes track from single element when element provided', () => {
      const element = track.attach();
      track.detach(element);
      expect(track.attachedElements).not.toContain(element);
    });

    it('removes track from all elements when no element provided', () => {
      const element1 = track.attach();
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element2);

      const detached = track.detach();

      expect(track.attachedElements).toHaveLength(0);
      expect(detached).toHaveLength(2);
    });

    it('updates attachedElements array correctly', () => {
      const element1 = track.attach();
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element2);

      track.detach(element1);

      expect(track.attachedElements).toContain(element2);
      expect(track.attachedElements).not.toContain(element1);
      expect(track.attachedElements).toHaveLength(1);
    });

    it('emits ElementDetached event', () => {
      const element = track.attach();
      const eventHandler = vi.fn();
      track.on(TrackEvent.ElementDetached, eventHandler);

      track.detach(element);

      expect(eventHandler).toHaveBeenCalledWith(element);
    });

    it('emits ElementDetached for all elements when detaching all', () => {
      const element1 = track.attach();
      const element2 = new MockHTMLAudioElement() as unknown as HTMLAudioElement;
      track.attach(element2);

      const eventHandler = vi.fn();
      track.on(TrackEvent.ElementDetached, eventHandler);

      track.detach();

      expect(eventHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('stop() Method', () => {
    it('calls stop() on mediaStreamTrack', () => {
      const stopSpy = vi.spyOn(mockMediaStreamTrack, 'stop');
      track.stop();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('stops monitoring', () => {
      const stopMonitorSpy = vi.spyOn(track, 'stopMonitor');
      track.stop();
      expect(stopMonitorSpy).toHaveBeenCalled();
    });
  });

  describe('Stream State Management', () => {
    it('gets current stream state', () => {
      expect(track.streamState).toBe(Track.StreamState.Active);
    });

    it('sets stream state correctly', () => {
      track.setStreamState(Track.StreamState.Paused);
      expect(track.streamState).toBe(Track.StreamState.Paused);
    });
  });

  describe('stopMonitor()', () => {
    it('clears monitor interval if set', () => {
      (track as any).monitorInterval = setInterval(() => {}, 1000);
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      track.stopMonitor();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('cancels animation frame if set', () => {
      (track as any).timeSyncHandle = 123;
      const cancelAnimationFrameSpy = vi.spyOn(global, 'cancelAnimationFrame');

      track.stopMonitor();

      expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(123);
    });
  });

  describe('mediaStreamID', () => {
    it('returns the mediaStreamTrack id', () => {
      expect(track.mediaStreamID).toBe(mockMediaStreamTrack.id);
    });
  });

  describe('currentBitrate', () => {
    it('returns current bitrate', () => {
      expect(track.currentBitrate).toBe(0);
    });

    it('can be updated', () => {
      (track as any)._currentBitrate = 1000;
      expect(track.currentBitrate).toBe(1000);
    });
  });
});

describe('attachToElement', () => {
  let track: EnhancedMockMediaStreamTrack;

  beforeEach(() => {
    track = new EnhancedMockMediaStreamTrack('video');
    track.updateSettings({ width: 640, height: 480 });
    global.MediaStream = MockMediaStream as any;
  });

  it('creates MediaStream if needed', () => {
    const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    attachToElement(track as unknown as MediaStreamTrack, element);
    expect(element.srcObject).toBeInstanceOf(MockMediaStream);
  });

  it('replaces existing tracks of same kind', () => {
    const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    const oldTrack = new EnhancedMockMediaStreamTrack('video');
    element.srcObject = new MockMediaStream([
      oldTrack as unknown as MediaStreamTrack,
    ]) as unknown as MediaStream;

    attachToElement(track as unknown as MediaStreamTrack, element);

    const mediaStream = element.srcObject as unknown as MockMediaStream;
    expect(mediaStream.getVideoTracks()).toHaveLength(1);
    expect(mediaStream.getVideoTracks()[0]).toBe(track);
  });

  it('sets autoplay, muted correctly', () => {
    const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    attachToElement(track as unknown as MediaStreamTrack, element);
    expect(element.autoplay).toBe(true);
  });

  it('sets playsInline for video elements', () => {
    // Need to setup global HTMLVideoElement for instanceof check
    global.HTMLVideoElement = MockHTMLVideoElement as any;

    const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    attachToElement(track as unknown as MediaStreamTrack, element);
    expect(element.playsInline).toBe(true);
  });

  it('mutes element when no audio tracks present', () => {
    const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    attachToElement(track as unknown as MediaStreamTrack, element);
    expect(element.muted).toBe(true);
  });

  it('does not mute element when audio tracks present', () => {
    const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    const audioTrack = new EnhancedMockMediaStreamTrack('audio');
    element.srcObject = new MockMediaStream([
      audioTrack as unknown as MediaStreamTrack,
    ]) as unknown as MediaStream;

    attachToElement(track as unknown as MediaStreamTrack, element);

    expect(element.muted).toBe(false);
  });
});

describe('detachTrack', () => {
  beforeEach(() => {
    global.MediaStream = MockMediaStream as any;
  });

  it('removes track from MediaStream', () => {
    const track = new EnhancedMockMediaStreamTrack('video');
    const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    element.srcObject = new MockMediaStream([
      track as unknown as MediaStreamTrack,
    ]) as unknown as MediaStream;

    detachTrack(track as unknown as MediaStreamTrack, element);

    // After detaching the last track, srcObject should be null
    expect(element.srcObject).toBeNull();
  });

  it('clears srcObject when no tracks remain', () => {
    const track = new EnhancedMockMediaStreamTrack('video');
    const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    element.srcObject = new MockMediaStream([
      track as unknown as MediaStreamTrack,
    ]) as unknown as MediaStream;

    detachTrack(track as unknown as MediaStreamTrack, element);

    expect(element.srcObject).toBeNull();
  });

  it('keeps srcObject when other tracks remain', () => {
    const track1 = new EnhancedMockMediaStreamTrack('video');
    const track2 = new EnhancedMockMediaStreamTrack('audio');
    const element = new MockHTMLVideoElement() as unknown as HTMLVideoElement;
    element.srcObject = new MockMediaStream([
      track1 as unknown as MediaStreamTrack,
      track2 as unknown as MediaStreamTrack,
    ]) as unknown as MediaStream;

    detachTrack(track1 as unknown as MediaStreamTrack, element);

    expect(element.srcObject).toBeInstanceOf(MockMediaStream);
    const mediaStream = element.srcObject as unknown as MockMediaStream;
    expect(mediaStream.getTracks()).toHaveLength(1);
  });
});

describe('Track.Source conversion', () => {
  it('converts Source to proto correctly', () => {
    expect(Track.sourceToProto(Track.Source.Camera)).toBeDefined();
    expect(Track.sourceToProto(Track.Source.Microphone)).toBeDefined();
    expect(Track.sourceToProto(Track.Source.ScreenShare)).toBeDefined();
    expect(Track.sourceToProto(Track.Source.ScreenShareAudio)).toBeDefined();
  });

  it('converts proto to Source correctly', () => {
    const cameraProto = Track.sourceToProto(Track.Source.Camera);
    expect(Track.sourceFromProto(cameraProto)).toBe(Track.Source.Camera);
  });
});

describe('Track.Kind conversion', () => {
  it('converts Kind to proto correctly', () => {
    expect(Track.kindToProto(Track.Kind.Audio)).toBeDefined();
    expect(Track.kindToProto(Track.Kind.Video)).toBeDefined();
  });

  it('converts proto to Kind correctly', () => {
    const audioProto = Track.kindToProto(Track.Kind.Audio);
    expect(Track.kindFromProto(audioProto)).toBe(Track.Kind.Audio);
  });
});
