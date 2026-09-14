import { TrackInfo, TrackPublishedResponse, TrackSource, VideoQuality } from '@livekit/protocol';
import type { AudioProcessorOptions, TrackProcessor, VideoProcessorOptions } from '../..';
import log from '../../logger';
import { cloneDeep } from '../../utils/cloneDeep';
import { isSafari, sleep } from '../utils';
import { Track } from './Track';
import type { TrackPublication } from './TrackPublication';
import {
  type AudioCaptureOptions,
  type CreateLocalTracksOptions,
  type ScreenShareCaptureOptions,
  type VideoCaptureOptions,
  type VideoCodec,
} from './options';
import type { AudioTrack } from './types';

export function mergeDefaultOptions(
  options?: CreateLocalTracksOptions,
  audioDefaults?: AudioCaptureOptions,
  videoDefaults?: VideoCaptureOptions,
): CreateLocalTracksOptions {
  const { optionsWithoutProcessor, audioProcessor, videoProcessor } = extractProcessorsFromOptions(
    options ?? {},
  );
  const defaultAudioProcessor = audioDefaults?.processor;
  const defaultVideoProcessor = videoDefaults?.processor;
  const clonedOptions: CreateLocalTracksOptions = optionsWithoutProcessor ?? {};
  if (clonedOptions.audio === true) clonedOptions.audio = {};
  if (clonedOptions.video === true) clonedOptions.video = {};

  // use defaults
  if (clonedOptions.audio) {
    mergeObjectWithoutOverwriting(
      clonedOptions.audio as Record<string, unknown>,
      audioDefaults as Record<string, unknown>,
    );
    clonedOptions.audio.deviceId ??= { ideal: 'default' };
    if (audioProcessor || defaultAudioProcessor) {
      clonedOptions.audio.processor = audioProcessor ?? defaultAudioProcessor;
    }
  }
  if (clonedOptions.video) {
    mergeObjectWithoutOverwriting(
      clonedOptions.video as Record<string, unknown>,
      videoDefaults as Record<string, unknown>,
    );
    clonedOptions.video.deviceId ??= { ideal: 'default' };
    if (videoProcessor || defaultVideoProcessor) {
      clonedOptions.video.processor = videoProcessor ?? defaultVideoProcessor;
    }
  }
  return clonedOptions;
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
      constraints.video.deviceId ??= { ideal: 'default' };
    } else {
      constraints.video = options.video ? { deviceId: { ideal: 'default' } } : false;
    }
  } else {
    constraints.video = false;
  }

  if (options.audio) {
    if (typeof options.audio === 'object') {
      constraints.audio = options.audio;
      constraints.audio.deviceId ??= { ideal: 'default' };
    } else {
      constraints.audio = { deviceId: { ideal: 'default' } };
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
    const audioContext = new AudioContext({ latencyHint: 'interactive' });
    // If the audio context is suspended, we need to resume it when the user clicks on the page
    if (
      audioContext.state === 'suspended' &&
      typeof window !== 'undefined' &&
      window.document?.body
    ) {
      const handleResume = async () => {
        try {
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
        } catch (e) {
          console.warn('Error trying to auto-resume audio context', e);
        } finally {
          window.document.body?.removeEventListener('click', handleResume);
        }
      };

      // https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/statechange_event
      audioContext.addEventListener('statechange', () => {
        if (audioContext.state === 'closed') {
          window.document.body?.removeEventListener('click', handleResume);
        }
      });

      window.document.body.addEventListener('click', handleResume);
    }
    return audioContext;
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
  // treat 0 as uncapped
  if (options.resolution && options.resolution.width > 0 && options.resolution.height > 0) {
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
    preferCurrentTab: options.preferCurrentTab,
  };
}

export function mimeTypeToVideoCodecString(mimeType: string) {
  return mimeType.split('/')[1].toLowerCase() as VideoCodec;
}

export function getTrackPublicationInfo<T extends TrackPublication>(
  tracks: T[],
): TrackPublishedResponse[] {
  const infos: TrackPublishedResponse[] = [];
  tracks.forEach((track: TrackPublication) => {
    if (track.track !== undefined) {
      infos.push(
        new TrackPublishedResponse({
          cid: track.track.mediaStreamID,
          track: track.trackInfo,
        }),
      );
    }
  });
  return infos;
}

export function getLogContextFromTrack(track: Track | TrackPublication): Record<string, unknown> {
  if ('mediaStreamTrack' in track) {
    return {
      trackID: track.sid,
      source: track.source,
      muted: track.isMuted,
      enabled: track.mediaStreamTrack.enabled,
      kind: track.kind,
      streamID: track.mediaStreamID,
      streamTrackID: track.mediaStreamTrack.id,
    };
  } else {
    return {
      trackID: track.trackSid,
      enabled: track.isEnabled,
      muted: track.isMuted,
      trackInfo: {
        mimeType: track.mimeType,
        name: track.trackName,
        encrypted: track.isEncrypted,
        kind: track.kind,
        source: track.source,
        ...(track.track ? getLogContextFromTrack(track.track) : {}),
      },
    };
  }
}

export function supportsSynchronizationSources(): boolean {
  return (
    typeof RTCRtpReceiver !== 'undefined' &&
    typeof RTCRtpReceiver.prototype.getSynchronizationSources === 'function'
  );
}

export function diffAttributes(
  oldValues: Record<string, string> | undefined,
  newValues: Record<string, string> | undefined,
) {
  if (oldValues === undefined) {
    oldValues = {};
  }
  if (newValues === undefined) {
    newValues = {};
  }
  const allKeys = [...Object.keys(newValues), ...Object.keys(oldValues)];
  const diff: Record<string, string> = {};

  for (const key of allKeys) {
    if (oldValues[key] !== newValues[key]) {
      diff[key] = newValues[key] ?? '';
    }
  }

  return diff;
}

/** @internal */
export function extractProcessorsFromOptions(options: CreateLocalTracksOptions) {
  const newOptions = { ...options };
  let audioProcessor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | undefined;
  let videoProcessor: TrackProcessor<Track.Kind.Video, VideoProcessorOptions> | undefined;

  if (typeof newOptions.audio === 'object' && newOptions.audio.processor) {
    audioProcessor = newOptions.audio.processor;
    newOptions.audio = { ...newOptions.audio, processor: undefined };
  }
  if (typeof newOptions.video === 'object' && newOptions.video.processor) {
    videoProcessor = newOptions.video.processor;
    newOptions.video = { ...newOptions.video, processor: undefined };
  }

  return { audioProcessor, videoProcessor, optionsWithoutProcessor: cloneDeep(newOptions) };
}

export function getTrackSourceFromProto(source: TrackSource): Track.Source {
  switch (source) {
    case TrackSource.CAMERA:
      return Track.Source.Camera;
    case TrackSource.MICROPHONE:
      return Track.Source.Microphone;
    case TrackSource.SCREEN_SHARE:
      return Track.Source.ScreenShare;
    case TrackSource.SCREEN_SHARE_AUDIO:
      return Track.Source.ScreenShareAudio;
    default:
      return Track.Source.Unknown;
  }
}

export function areDimensionsSmaller(a: Track.Dimensions, b: Track.Dimensions): boolean {
  return a.width * a.height < b.width * b.height;
}

export function layerDimensionsFor(
  trackInfo: TrackInfo,
  quality: VideoQuality,
): Track.Dimensions | undefined {
  return trackInfo.layers?.find((l) => l.quality === quality);
}

/**
 * Waits until `track` has actually produced a video frame.
 *
 * iOS keeps reporting the camera's sensor frame from `getSettings()` until the camera has
 * delivered its first picture, so a portrait capture initially reads as landscape. The arrival
 * of that first frame is the only reliable signal that the reported settings describe reality.
 *
 * Best effort, never throws. Resolves `true` when a frame was observed, `false` when no frame
 * can be observed (the track is already ended, muted or disabled) or `timeoutMs` elapsed first.
 *
 * @internal
 */
export async function waitForFirstVideoFrame(
  track: MediaStreamTrack,
  timeoutMs: number,
  candidateElements: HTMLMediaElement[] = [],
): Promise<boolean> {
  if (typeof document === 'undefined') {
    return false;
  }
  if (track.readyState === 'ended' || track.muted || !track.enabled) {
    // no frame is ever going to arrive, don't hold the caller up for the full timeout
    return false;
  }

  // requestVideoFrameCallback (Safari 15.4 and up) is a platform capability, so the answer is the
  // same for every element
  const supportsFrameCallback =
    typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function';

  // prefer an element that is already rendering this track (a local preview, typically) over
  // spinning up a second decode just to observe a frame
  const existingElement = candidateElements.find(
    (el): el is HTMLVideoElement =>
      el instanceof HTMLVideoElement &&
      el.srcObject instanceof MediaStream &&
      el.srcObject.getVideoTracks().includes(track) &&
      // without requestVideoFrameCallback we depend on `loadeddata`, which is one-shot: an element
      // that already decoded a frame (readyState >= HAVE_CURRENT_DATA) never fires it again.
      // Leave those alone and set up our own element, which starts out empty.
      (supportsFrameCallback || el.readyState < 2),
  );

  const element = existingElement ?? document.createElement('video');
  if (!existingElement) {
    element.playsInline = true;
    element.muted = true;
    element.srcObject = new MediaStream([track]);
    // the element is deliberately never added to the DOM, it only exists to pull frames.
    // WebKit delivers frames to a paused element too, so a rejected play() (Safari's low power
    // mode, for instance) is not a reason to stop waiting
    element.play().catch((error) => {
      log.debug('could not play element while waiting for the first video frame', { error });
    });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let frameHandle: number | undefined;
  let onLoadedData: (() => void) | undefined;

  try {
    return await new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
      if (supportsFrameCallback) {
        frameHandle = element.requestVideoFrameCallback(() => resolve(true));
      } else {
        // Safari below 15.4 has no requestVideoFrameCallback. `loadeddata` fires once the first
        // frame has been decoded, which is the same signal a few milliseconds earlier.
        onLoadedData = () => resolve(true);
        element.addEventListener('loadeddata', onLoadedData);
      }
    });
  } finally {
    clearTimeout(timer);
    if (frameHandle !== undefined) {
      element.cancelVideoFrameCallback?.(frameHandle);
    }
    if (onLoadedData) {
      element.removeEventListener('loadeddata', onLoadedData);
    }
    if (!existingElement) {
      element.pause();
      element.srcObject = null;
    }
  }
}
