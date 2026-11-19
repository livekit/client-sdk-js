import { describe, expect, it, vi } from 'vitest';
import { TrackInvalidError } from '../errors';
import LocalAudioTrack from './LocalAudioTrack';

function audioCapture() {
  return Object.assign(new EventTarget(), {
    kind: 'audio',
    id: 'audio-capture',
    label: 'capture',
    enabled: true,
    muted: false,
    readyState: 'live',
    stop: vi.fn(),
    getSettings: () => ({}),
    getConstraints: () => ({}),
  }) as unknown as MediaStreamTrack;
}

describe('setProcessor', () => {
  it('rejects with a TrackInvalidError and destroys the processor when the track is stopped during init', async () => {
    const track = new LocalAudioTrack(audioCapture(), undefined, true, {} as AudioContext);
    let processorInitialized!: () => void;
    const destroy = vi.fn(async () => {});

    const setProcessor = track.setProcessor({
      name: 'slow',
      processedTrack: audioCapture(),
      init: () => new Promise<void>((resolve) => (processorInitialized = resolve)),
      destroy,
      restart: async () => {},
    });
    await vi.waitFor(() => expect(processorInitialized).toBeDefined());
    track.stop();
    processorInitialized();

    await expect(setProcessor).rejects.toBeInstanceOf(TrackInvalidError);
    expect(destroy).toHaveBeenCalledOnce();
    expect(track.getProcessor()).toBeUndefined();
  });
});
