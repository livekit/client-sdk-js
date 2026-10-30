import { describe, expect, it, vi } from 'vitest';
import LocalVideoTrack from './LocalVideoTrack';

function mediaTrack(constraints: MediaTrackConstraints): MediaStreamTrack {
  const track = {
    contentHint: '',
    enabled: true,
    id: 'camera-track',
    kind: 'video',
    label: 'External Camera',
    muted: false,
    readyState: 'live' as MediaStreamTrackState,
    onended: null,
    onmute: null,
    onunmute: null,
    applyConstraints: vi.fn().mockResolvedValue(undefined),
    clone: () => mediaTrack(constraints),
    getCapabilities: () => ({}),
    getConstraints: () => constraints,
    getSettings: () => ({ deviceId: 'external-cam', width: 1280, height: 720 }),
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: () => true,
  };
  return track as unknown as MediaStreamTrack;
}

class SettledVideoTrack extends LocalVideoTrack {
  /** Resolves once the constructor has finished adopting the initial track. */
  async whenAdopted() {
    const unlock = await this.trackChangeLock.lock();
    unlock();
  }
}

describe('LocalVideoTrack restartWithoutCurrentDevice', () => {
  it('restarts without the device id and keeps the other constraints', async () => {
    const constraints: MediaTrackConstraints = {
      deviceId: { exact: 'external-cam' },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: 30,
      facingMode: 'user',
    };
    const track = new SettledVideoTrack(mediaTrack(constraints), constraints, false);
    await track.whenAdopted();
    const restartTrack = vi.spyOn(track, 'restartTrack').mockResolvedValue(undefined);

    await track.restartWithoutCurrentDevice();

    expect(restartTrack).toHaveBeenCalledOnce();
    expect(track.constraints).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: 30,
      facingMode: 'user',
    });
  });
});
