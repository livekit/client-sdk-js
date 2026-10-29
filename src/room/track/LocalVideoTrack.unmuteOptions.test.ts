import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LocalVideoTrack from './LocalVideoTrack';
import { Track } from './Track';
import { VideoPresets } from './options';

describe('LocalVideoTrack.unmute capture options', () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    getUserMedia.mockReset();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      product: 'Gecko',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fakeTrack(
    settings: MediaTrackSettings = { width: 1280, height: 720 },
  ): MediaStreamTrack {
    const listeners = new Map<string, Set<EventListener>>();
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    return {
      kind: 'video',
      id: `t-${Math.random()}`,
      label: 'fake',
      enabled: true,
      muted: false,
      readyState: 'live' as MediaStreamTrackState,
      contentHint: '',
      onended: null,
      onmute: null,
      onunmute: null,
      getSettings: () => settings,
      getConstraints: () => ({}),
      getCapabilities: () => ({}) as MediaTrackCapabilities,
      applyConstraints,
      stop: vi.fn(),
      clone: vi.fn(function (this: MediaStreamTrack) {
        return fakeTrack(this.getSettings());
      }),
      addEventListener: (type: string, listener: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: () => true,
    } as unknown as MediaStreamTrack;
  }

  it('applies setCameraEnabled capture options on unmute via applyConstraints', async () => {
    const initial = fakeTrack({ width: 1280, height: 720 });
    const next = fakeTrack({ width: 1920, height: 1080 });
    getUserMedia.mockResolvedValue({
      getTracks: () => [next],
      getVideoTracks: () => [next],
      getAudioTracks: () => [],
    });

    // userProvidedTrack=false so unmute reacquires the camera (SDK-managed)
    const track = new LocalVideoTrack(initial, { width: 1280, height: 720 }, false, {
      loggerName: 'test',
      loggerOptions: {},
    });
    track.source = Track.Source.Camera;
    await track.mute();

    await track.unmute({ resolution: VideoPresets.h1080.resolution });

    expect(getUserMedia).toHaveBeenCalled();
    // Video restart acquires by deviceId/facingMode, then applyConstraints for resolution.
    expect(next.applyConstraints).toHaveBeenCalledWith(
      expect.objectContaining({
        width: VideoPresets.h1080.resolution.width,
        height: VideoPresets.h1080.resolution.height,
      }),
    );
    // Stored constraints updated so a later option-less unmute keeps the new settings.
    expect((track as unknown as { _constraints: MediaTrackConstraints })._constraints).toEqual(
      expect.objectContaining({
        width: VideoPresets.h1080.resolution.width,
        height: VideoPresets.h1080.resolution.height,
      }),
    );
  });

  it('still reacquires the camera when unmute has no options', async () => {
    const initial = fakeTrack({ width: 1280, height: 720 });
    const next = fakeTrack({ width: 1280, height: 720 });
    getUserMedia.mockResolvedValue({
      getTracks: () => [next],
      getVideoTracks: () => [next],
      getAudioTracks: () => [],
    });

    const track = new LocalVideoTrack(initial, { width: 1280, height: 720 }, false, {
      loggerName: 'test',
      loggerOptions: {},
    });
    track.source = Track.Source.Camera;
    await track.mute();
    await track.unmute();

    expect(getUserMedia).toHaveBeenCalled();
    expect(track.isMuted).toBe(false);
  });
});
