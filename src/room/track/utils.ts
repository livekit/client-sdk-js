import { sleep } from '../utils';
import log from './../../logger';
import LocalTrack from './LocalTrack';
import type { AudioCaptureOptions, CreateLocalTracksOptions, VideoCaptureOptions } from './options';
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

type FacingMode = NonNullable<VideoCaptureOptions['facingMode']>;
type FacingModeFromLocalTrackOptions = {
  /**
   * If no facing mode can be determined, this value will be used.
   * @defaultValue 'user'
   */
  defaultFacingMode?: FacingMode;
};
type FacingModeFromLocalTrackReturnValue = {
  /**
   * The (probable) facingMode of the track.
   * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode | MDN docs on facingMode}
   */
  facingMode: FacingMode;
  /**
   * The confidence that the returned facingMode is correct.
   */
  confidence: 'high' | 'medium' | 'low';
};

/**
 * Try to analyze the local track to determine the facing mode of a track.
 *
 * @remarks
 * There is no property supported by all browsers to detect whether a video track originated from a user- or environment-facing camera device.
 * For this reason, we use the `facingMode` property when available, but will fall back on a string-based analysis of the device label to determine the facing mode.
 * If both methods fail, the default facing mode will be used.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode | MDN docs on facingMode}
 * @experimental
 */
export function facingModeFromLocalTrack(
  localTrack: LocalTrack | MediaStreamTrack,
  options: FacingModeFromLocalTrackOptions = {},
): FacingModeFromLocalTrackReturnValue {
  const track = localTrack instanceof LocalTrack ? localTrack.mediaStreamTrack : localTrack;
  const trackSettings = track.getSettings();
  let result: FacingModeFromLocalTrackReturnValue = {
    facingMode: options.defaultFacingMode ?? 'user',
    confidence: 'low',
  };

  // 1. Try to get facingMode from track settings.
  if ('facingMode' in trackSettings) {
    const rawFacingMode = trackSettings.facingMode;
    log.debug('rawFacingMode', { rawFacingMode });
    if (rawFacingMode && typeof rawFacingMode === 'string' && isFacingModeValue(rawFacingMode)) {
      result = { facingMode: rawFacingMode, confidence: 'high' };
    }
  }

  // 2. If we don't have a high confidence we try to get the facing mode from the device label.
  if (['low', 'medium'].includes(result.confidence)) {
    log.debug(`Try to get facing mode from device label: (${track.label})`);
    const labelAnalysisResult = facingModeFromDeviceLabel(track.label);
    if (labelAnalysisResult !== undefined) {
      result = labelAnalysisResult;
    }
  }

  return result;
}

const knownDeviceLabels = new Map<string, FacingModeFromLocalTrackReturnValue>([
  ['obs virtual camera', { facingMode: 'environment', confidence: 'medium' }],
]);
const knownDeviceLabelSections = new Map<string, FacingModeFromLocalTrackReturnValue>([
  ['iphone', { facingMode: 'environment', confidence: 'medium' }],
  ['ipad', { facingMode: 'environment', confidence: 'medium' }],
]);
/**
 * Attempt to analyze the device label to determine the facing mode.
 *
 * @experimental
 */
export function facingModeFromDeviceLabel(
  deviceLabel: string,
): FacingModeFromLocalTrackReturnValue | undefined {
  const label = deviceLabel.trim().toLowerCase();
  // Empty string is a valid device label but we can't infer anything from it.
  if (label === '') {
    return undefined;
  }

  // Can we match against widely known device labels.
  if (knownDeviceLabels.has(label)) {
    return knownDeviceLabels.get(label);
  }

  // Can we match against sections of the device label.
  return Array.from(knownDeviceLabelSections.entries()).find(([section]) =>
    label.includes(section),
  )?.[1];
}

function isFacingModeValue(item: string): item is FacingMode {
  const allowedValues: FacingMode[] = ['user', 'environment', 'left', 'right'];
  return item === undefined || allowedValues.includes(item as FacingMode);
}
