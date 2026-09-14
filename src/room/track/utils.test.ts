import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioDefaults, videoDefaults } from '../defaults';
import { type AudioCaptureOptions, VideoPresets } from './options';
import {
  constraintsForOptions,
  diffAttributes,
  mergeDefaultOptions,
  waitForFirstVideoFrame,
} from './utils';

describe('mergeDefaultOptions', () => {
  it('does not enable undefined options', () => {
    const opts = mergeDefaultOptions(undefined, audioDefaults, videoDefaults);
    expect(opts.audio).toEqual(undefined);
    expect(opts.video).toEqual(undefined);
  });

  it('does not enable explicitly disabled', () => {
    const opts = mergeDefaultOptions({
      video: false,
    });
    expect(opts.audio).toEqual(undefined);
    expect(opts.video).toEqual(false);
  });

  it('accepts true for options', () => {
    const opts = mergeDefaultOptions(
      {
        audio: true,
      },
      audioDefaults,
      videoDefaults,
    );
    expect(opts.audio).toEqual(audioDefaults);
    expect(opts.video).toEqual(undefined);
  });

  it('enables overriding specific fields', () => {
    const opts = mergeDefaultOptions(
      {
        audio: { channelCount: 1 },
      },
      audioDefaults,
      videoDefaults,
    );
    const audioOpts = opts.audio as AudioCaptureOptions;
    expect(audioOpts.channelCount).toEqual(1);
    expect(audioOpts.autoGainControl).toEqual(true);
  });

  it('does not override explicit false', () => {
    const opts = mergeDefaultOptions(
      {
        audio: { autoGainControl: false },
      },
      audioDefaults,
      videoDefaults,
    );
    const audioOpts = opts.audio as AudioCaptureOptions;
    expect(audioOpts.autoGainControl).toEqual(false);
  });
});

describe('constraintsForOptions', () => {
  it('correctly enables audio bool', () => {
    const constraints = constraintsForOptions({
      audio: true,
    });
    expect(constraints.audio).toEqual({ deviceId: audioDefaults.deviceId });
    expect(constraints.video).toEqual(false);
  });

  it('converts audio options correctly', () => {
    const constraints = constraintsForOptions({
      audio: {
        noiseSuppression: true,
        echoCancellation: false,
      },
    });
    const audioOpts = constraints.audio as MediaTrackConstraints;
    expect(Object.keys(audioOpts)).toEqual(['noiseSuppression', 'echoCancellation', 'deviceId']);
    expect(audioOpts.noiseSuppression).toEqual(true);
    expect(audioOpts.echoCancellation).toEqual(false);
  });

  it('converts video options correctly', () => {
    const constraints = constraintsForOptions({
      video: {
        resolution: VideoPresets.h720.resolution,
        facingMode: 'user',
        deviceId: 'video123',
      },
    });
    const videoOpts = constraints.video as MediaTrackConstraints;
    expect(Object.keys(videoOpts)).toEqual([
      'width',
      'height',
      'frameRate',
      'aspectRatio',
      'facingMode',
      'deviceId',
    ]);
    expect(videoOpts.width).toEqual(VideoPresets.h720.resolution.width);
    expect(videoOpts.height).toEqual(VideoPresets.h720.resolution.height);
    expect(videoOpts.frameRate).toEqual(VideoPresets.h720.resolution.frameRate);
    expect(videoOpts.aspectRatio).toEqual(VideoPresets.h720.resolution.aspectRatio);
  });
});

describe('diffAttributes', () => {
  it('detects changed values', () => {
    const oldValues: Record<string, string> = { a: 'value', b: 'initial', c: 'value' };
    const newValues: Record<string, string> = { a: 'value', b: 'updated', c: 'value' };

    const diff = diffAttributes(oldValues, newValues);
    expect(Object.keys(diff).length).toBe(1);
    expect(diff.b).toBe('updated');
  });
  it('detects new values', () => {
    const newValues: Record<string, string> = { a: 'value', b: 'value', c: 'value' };
    const oldValues: Record<string, string> = { a: 'value', b: 'value' };

    const diff = diffAttributes(oldValues, newValues);
    expect(Object.keys(diff).length).toBe(1);
    expect(diff.c).toBe('value');
  });
  it('detects deleted values as empty strings', () => {
    const newValues: Record<string, string> = { a: 'value', b: 'value' };
    const oldValues: Record<string, string> = { a: 'value', b: 'value', c: 'value' };

    const diff = diffAttributes(oldValues, newValues);
    expect(Object.keys(diff).length).toBe(1);
    expect(diff.c).toBe('');
  });
  it('compares with undefined values', () => {
    const newValues: Record<string, string> = { a: 'value', b: 'value' };

    const diff = diffAttributes(undefined, newValues);
    expect(Object.keys(diff).length).toBe(2);
    expect(diff.a).toBe('value');
  });
});

class FakeVideoTrack extends EventTarget {
  kind = 'video';

  id = 'fake-video-track';

  label = 'fake';

  enabled = true;

  muted = false;

  readyState: MediaStreamTrackState = 'live';

  settings: MediaTrackSettings;

  constructor(settings: MediaTrackSettings = { width: 1280, height: 720 }) {
    super();
    this.settings = settings;
  }

  getSettings() {
    return this.settings;
  }

  getConstraints() {
    return {};
  }
}

const asMediaStreamTrack = (track: FakeVideoTrack) => track as unknown as MediaStreamTrack;

describe('waitForFirstVideoFrame', () => {
  let frameCallbacks: Map<number, VideoFrameRequestCallback>;
  let cancelledHandles: number[];
  let createdVideoElements: HTMLVideoElement[];

  /** happy-dom has no requestVideoFrameCallback, install a controllable one */
  function enableFrameCallbacks() {
    let nextHandle = 1;
    HTMLVideoElement.prototype.requestVideoFrameCallback = function requestVideoFrameCallback(
      callback: VideoFrameRequestCallback,
    ) {
      const handle = nextHandle;
      nextHandle += 1;
      frameCallbacks.set(handle, callback);
      return handle;
    };
    HTMLVideoElement.prototype.cancelVideoFrameCallback = function cancelVideoFrameCallback(
      handle: number,
    ) {
      cancelledHandles.push(handle);
      frameCallbacks.delete(handle);
    };
  }

  function deliverFrame() {
    Array.from(frameCallbacks.values()).forEach((callback) =>
      callback(0, {} as VideoFrameCallbackMetadata),
    );
  }

  beforeEach(() => {
    frameCallbacks = new Map();
    cancelledHandles = [];
    createdVideoElements = [];
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
      options?: ElementCreationOptions,
    ) => {
      const element = createElement(tagName, options);
      if (tagName === 'video') {
        createdVideoElements.push(element as HTMLVideoElement);
      }
      return element;
    }) as typeof document.createElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error removing the stand-in we installed above
    delete HTMLVideoElement.prototype.requestVideoFrameCallback;
    // @ts-expect-error removing the stand-in we installed above
    delete HTMLVideoElement.prototype.cancelVideoFrameCallback;
  });

  it('resolves once a frame has been delivered', async () => {
    enableFrameCallbacks();
    const pending = waitForFirstVideoFrame(asMediaStreamTrack(new FakeVideoTrack()), 1000);
    expect(createdVideoElements).toHaveLength(1);

    deliverFrame();

    await expect(pending).resolves.toBe(true);
  });

  it('gives up once the timeout elapses', async () => {
    enableFrameCallbacks();

    await expect(
      waitForFirstVideoFrame(asMediaStreamTrack(new FakeVideoTrack()), 20),
    ).resolves.toBe(false);
  });

  it.each([
    ['ended', { readyState: 'ended' as MediaStreamTrackState }],
    ['muted', { muted: true }],
    ['disabled', { enabled: false }],
  ])('does not wait on a track that is %s', async (_label, overrides) => {
    enableFrameCallbacks();
    const track = Object.assign(new FakeVideoTrack(), overrides);

    await expect(waitForFirstVideoFrame(asMediaStreamTrack(track), 10_000)).resolves.toBe(false);
    expect(createdVideoElements).toHaveLength(0);
  });

  it('falls back to loadeddata when requestVideoFrameCallback is unavailable', async () => {
    const pending = waitForFirstVideoFrame(asMediaStreamTrack(new FakeVideoTrack()), 1000);

    createdVideoElements[0].dispatchEvent(new Event('loadeddata'));

    await expect(pending).resolves.toBe(true);
  });

  it('keeps waiting when play() is rejected', async () => {
    enableFrameCallbacks();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('NotAllowedError'));
    const pending = waitForFirstVideoFrame(asMediaStreamTrack(new FakeVideoTrack()), 1000);

    deliverFrame();

    await expect(pending).resolves.toBe(true);
  });

  it('reuses an element that already renders the track', async () => {
    enableFrameCallbacks();
    const track = new FakeVideoTrack();
    const attached = document.createElement('video');
    attached.srcObject = new MediaStream([asMediaStreamTrack(track)]);
    createdVideoElements.length = 0;

    const pending = waitForFirstVideoFrame(asMediaStreamTrack(track), 1000, [attached]);
    expect(createdVideoElements).toHaveLength(0);
    deliverFrame();

    await expect(pending).resolves.toBe(true);
    // the caller owns that element, it must be left rendering
    expect(attached.srcObject).not.toBeNull();
  });

  it('reuses an element that has not decoded a frame yet without requestVideoFrameCallback', async () => {
    const track = new FakeVideoTrack();
    const attached = document.createElement('video');
    attached.srcObject = new MediaStream([asMediaStreamTrack(track)]);
    Object.defineProperty(attached, 'readyState', { value: 1, configurable: true });
    createdVideoElements.length = 0;

    const pending = waitForFirstVideoFrame(asMediaStreamTrack(track), 1000, [attached]);
    expect(createdVideoElements).toHaveLength(0);
    // `loadeddata` has not fired on that element yet, so listening for it still works
    attached.dispatchEvent(new Event('loadeddata'));

    await expect(pending).resolves.toBe(true);
  });

  it('declines an already loaded element without requestVideoFrameCallback', async () => {
    const track = new FakeVideoTrack();
    const attached = document.createElement('video');
    attached.srcObject = new MediaStream([asMediaStreamTrack(track)]);
    Object.defineProperty(attached, 'readyState', { value: 2, configurable: true });
    createdVideoElements.length = 0;

    const pending = waitForFirstVideoFrame(asMediaStreamTrack(track), 1000, [attached]);
    // `loadeddata` already fired on that element and is never replayed, so we need our own
    expect(createdVideoElements).toHaveLength(1);
    createdVideoElements[0].dispatchEvent(new Event('loadeddata'));

    await expect(pending).resolves.toBe(true);
  });

  it('tears down the element it created', async () => {
    enableFrameCallbacks();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const pending = waitForFirstVideoFrame(asMediaStreamTrack(new FakeVideoTrack()), 1000);

    deliverFrame();
    await pending;

    expect(createdVideoElements[0].srcObject).toBeNull();
    expect(pause).toHaveBeenCalled();
    expect(cancelledHandles).toHaveLength(1);
  });
});
