import { isSafari, sleep } from '../utils';
import { Track } from './Track';
import type {
  AudioCaptureOptions,
  CreateLocalTracksOptions,
  ScreenShareCaptureOptions,
  VideoCaptureOptions,
} from './options';
import type { AudioTrack } from './types';

export function mergeDefaultOptions(
  options?: CreateLocalTracksOptions,
  audioDefaults?: AudioCaptureOptions,
  videoDefaults?: VideoCaptureOptions,
): CreateLocalTracksOptions {
  const opts: CreateLocalTracksOptions = {
    ...options,
  };
  if (opts.audio === true) opts.audio = {};
  if (opts.video === true) opts.video = {};

  // use defaults
  if (opts.audio) {
    mergeObjectWithoutOverwriting(
      opts.audio as Record<string, unknown>,
      audioDefaults as Record<string, unknown>,
    );
  }
  if (opts.video) {
    mergeObjectWithoutOverwriting(
      opts.video as Record<string, unknown>,
      videoDefaults as Record<string, unknown>,
    );
  }
  return opts;
}

function mergeObjectWithoutOverwriting(
  mainObject: Record<string, unknown>,
  objectToMerge: Record<string, unknown>,
): Record<string, unknown> {
  Object.keys(objectToMerge).forEach((key) => {
    if (mainObject[key] === undefined) mainObject[key] = objectToMerge[key];
  });
  return mainObject;
}

export function constraintsForOptions(options: CreateLocalTracksOptions): MediaStreamConstraints {
  const constraints: MediaStreamConstraints = {};

  if (options.video) {
    // default video options
    if (typeof options.video === 'object') {
      const videoOptions: MediaTrackConstraints = {};
      const target = videoOptions as Record<string, unknown>;
      const source = options.video as Record<string, unknown>;
      Object.keys(source).forEach((key) => {
        switch (key) {
          case 'resolution':
            // flatten VideoResolution fields
            mergeObjectWithoutOverwriting(target, source.resolution as Record<string, unknown>);
            break;
          default:
            target[key] = source[key];
        }
      });
      constraints.video = videoOptions;
    } else {
      constraints.video = options.video;
    }
  } else {
    constraints.video = false;
  }

  if (options.audio) {
    if (typeof options.audio === 'object') {
      constraints.audio = options.audio;
    } else {
      constraints.audio = true;
    }
  } else {
    constraints.audio = false;
  }
  return constraints;
}
/**
 * This function detects silence on a given [[Track]] instance.
 * Returns true if the track seems to be entirely silent.
 */
export async function detectSilence(track: AudioTrack, timeOffset = 200): Promise<boolean> {
  const ctx = getNewAudioContext();
  if (ctx) {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const source = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));

    source.connect(analyser);
    await sleep(timeOffset);
    analyser.getByteTimeDomainData(dataArray);
    const someNoise = dataArray.some((sample) => sample !== 128 && sample !== 0);
    ctx.close();
    return !someNoise;
  }
  return false;
}

/**
 * @internal
 */
export function getNewAudioContext(): AudioContext | void {
  const AudioContext =
    // @ts-ignore
    typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (AudioContext) {
    return new AudioContext({ latencyHint: 'interactive' });
  }
}

/**
 * @internal
 */
export function kindToSource(kind: MediaDeviceKind) {
  if (kind === 'audioinput') {
    return Track.Source.Microphone;
  } else if (kind === 'videoinput') {
    return Track.Source.Camera;
  } else {
    return Track.Source.Unknown;
  }
}

/**
 * @internal
 */
export function sourceToKind(source: Track.Source): MediaDeviceKind | undefined {
  if (source === Track.Source.Microphone) {
    return 'audioinput';
  } else if (source === Track.Source.Camera) {
    return 'videoinput';
  } else {
    return undefined;
  }
}

/**
 * @internal
 */
export function screenCaptureToDisplayMediaStreamOptions(
  options: ScreenShareCaptureOptions,
): DisplayMediaStreamOptions {
  let videoConstraints: MediaTrackConstraints | boolean = options.video ?? true;
  if (options.resolution) {
    videoConstraints = typeof videoConstraints === 'boolean' ? {} : videoConstraints;
    if (isSafari()) {
      videoConstraints = {
        ...videoConstraints,
        width: { max: options.resolution.width },
        height: { max: options.resolution.height },
        frameRate: options.resolution.frameRate,
      };
    } else {
      videoConstraints = {
        ...videoConstraints,
        width: { ideal: options.resolution.width },
        height: { ideal: options.resolution.height },
        frameRate: options.resolution.frameRate,
      };
    }
  }

  return {
    audio: options.audio ?? false,
    video: videoConstraints,
    // @ts-expect-error support for experimental display media features
    controller: options.controller,
    selfBrowserSurface: options.selfBrowserSurface,
    surfaceSwitching: options.surfaceSwitching,
    systemAudio: options.systemAudio,
  };
}
