import DeviceManager from '../DeviceManager';
import { audioDefaults } from '../defaults';
import { TrackInvalidError } from '../errors';
import type { LoggerOptions } from '../types';
import { isAudioTrack, isVideoTrack, unwrapConstraint } from '../utils';
import LocalAudioTrack from './LocalAudioTrack';
import type LocalTrack from './LocalTrack';
import type LocalVideoTrack from './LocalVideoTrack';
import { Track } from './Track';
import type { AudioCaptureOptions, CreateLocalTracksOptions, VideoCaptureOptions } from './options';
import { constraintsForOptions, extractProcessorsFromOptions, mergeDefaultOptions } from './utils';

/**
 * How core creates video tracks. The `video` extension (and the full entry) registers it; without
 * it, requesting a video track throws.
 * @internal
 */
export interface VideoCapture {
  defaults: VideoCaptureOptions;
  createTrack(
    mediaStreamTrack: MediaStreamTrack,
    constraints: MediaTrackConstraints | undefined,
    userProvidedTrack: boolean,
    loggerOptions?: LoggerOptions,
  ): LocalVideoTrack;
}

let videoCapture: VideoCapture | undefined;

/** @internal */
export function setVideoCapture(capture: VideoCapture) {
  videoCapture = capture;
}

/** @internal */
export function getVideoCapture(): VideoCapture {
  if (!videoCapture) {
    // @throws-transformer ignore - programmer error
    throw new TrackInvalidError(
      'video capture is not available in this build, add the video extension',
    );
  }
  return videoCapture;
}

/**
 * Creates a local video and audio track at the same time. When acquiring both
 * audio and video tracks together, it'll display a single permission prompt to
 * the user instead of two separate ones.
 * @param options
 */
export async function createLocalTracks(
  options?: CreateLocalTracksOptions,
  loggerOptions?: LoggerOptions,
): Promise<Array<LocalTrack>> {
  options ??= {};
  let attemptExactMatch = false;

  const {
    audioProcessor,
    videoProcessor,
    optionsWithoutProcessor: internalOptions,
  } = extractProcessorsFromOptions(options);

  let retryAudioOptions: AudioCaptureOptions | undefined | boolean = internalOptions.audio;
  let retryVideoOptions: VideoCaptureOptions | undefined | boolean = internalOptions.video;

  if (audioProcessor && typeof internalOptions.audio === 'object') {
    internalOptions.audio.processor = audioProcessor;
  }
  if (videoProcessor && typeof internalOptions.video === 'object') {
    internalOptions.video.processor = videoProcessor;
  }

  // if the user passes a device id as a string, we default to exact match
  if (
    options.audio &&
    typeof internalOptions.audio === 'object' &&
    typeof internalOptions.audio.deviceId === 'string'
  ) {
    const deviceId: string = internalOptions.audio.deviceId;
    internalOptions.audio.deviceId = { exact: deviceId };
    attemptExactMatch = true;
    retryAudioOptions = {
      ...internalOptions.audio,
      deviceId: { ideal: deviceId },
    };
  }
  if (
    internalOptions.video &&
    typeof internalOptions.video === 'object' &&
    typeof internalOptions.video.deviceId === 'string'
  ) {
    const deviceId: string = internalOptions.video.deviceId;
    internalOptions.video.deviceId = { exact: deviceId };
    attemptExactMatch = true;
    retryVideoOptions = {
      ...internalOptions.video,
      deviceId: { ideal: deviceId },
    };
  }
  if (internalOptions.audio === true) {
    internalOptions.audio = { deviceId: 'default' };
  } else if (typeof internalOptions.audio === 'object' && internalOptions.audio !== null) {
    internalOptions.audio = {
      ...internalOptions.audio,
      deviceId: internalOptions.audio.deviceId || 'default',
    };
  }
  if (internalOptions.video === true) {
    internalOptions.video = { deviceId: 'default' };
  } else if (typeof internalOptions.video === 'object' && !internalOptions.video.deviceId) {
    internalOptions.video.deviceId = 'default';
  }
  const opts = mergeDefaultOptions(
    internalOptions,
    audioDefaults,
    internalOptions.video ? getVideoCapture().defaults : undefined,
  );
  const constraints = constraintsForOptions(opts);

  // Keep a reference to the promise on DeviceManager and await it in getLocalDevices()
  // works around iOS Safari Bug https://bugs.webkit.org/show_bug.cgi?id=179363
  const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);

  if (internalOptions.audio) {
    DeviceManager.userMediaPromiseMap.set('audioinput', mediaPromise);
    mediaPromise.catch(() => DeviceManager.userMediaPromiseMap.delete('audioinput'));
  }
  if (internalOptions.video) {
    DeviceManager.userMediaPromiseMap.set('videoinput', mediaPromise);
    mediaPromise.catch(() => DeviceManager.userMediaPromiseMap.delete('videoinput'));
  }
  try {
    const stream = await mediaPromise;
    return await Promise.all(
      stream.getTracks().map(async (mediaStreamTrack) => {
        const isAudio = mediaStreamTrack.kind === 'audio';
        let trackConstraints: MediaTrackConstraints | undefined;
        const conOrBool = isAudio ? constraints.audio : constraints.video;
        if (typeof conOrBool !== 'boolean') {
          trackConstraints = conOrBool;
        }

        // update the constraints with the device id the user gave permissions to in the permission prompt
        // otherwise each track restart (e.g. mute - unmute) will try to initialize the device again -> causing additional permission prompts
        const newDeviceId = mediaStreamTrack.getSettings().deviceId;
        if (
          trackConstraints?.deviceId &&
          unwrapConstraint(trackConstraints.deviceId) !== newDeviceId
        ) {
          trackConstraints.deviceId = newDeviceId;
        } else if (!trackConstraints) {
          trackConstraints = { deviceId: newDeviceId };
        }

        const track: LocalTrack =
          mediaStreamTrack.kind === 'audio'
            ? new LocalAudioTrack(
                mediaStreamTrack,
                trackConstraints,
                false,
                undefined,
                loggerOptions,
              )
            : getVideoCapture().createTrack(
                mediaStreamTrack,
                trackConstraints,
                false,
                loggerOptions,
              );
        if (track.kind === Track.Kind.Video) {
          track.source = Track.Source.Camera;
        } else if (track.kind === Track.Kind.Audio) {
          track.source = Track.Source.Microphone;
        }
        track.mediaStream = stream;

        if (isAudioTrack(track) && audioProcessor) {
          await track.setProcessor(audioProcessor);
        } else if (isVideoTrack(track) && videoProcessor) {
          await track.setProcessor(videoProcessor);
        }

        return track;
      }),
    );
  } catch (e) {
    if (!attemptExactMatch) {
      throw e;
    }
    return createLocalTracks(
      {
        ...options,
        audio: retryAudioOptions,
        video: retryVideoOptions,
      },
      loggerOptions,
    );
  }
}

export async function createLocalAudioTrack(
  options?: AudioCaptureOptions,
): Promise<LocalAudioTrack> {
  const tracks = await createLocalTracks({
    audio: options ?? true,
    video: false,
  });
  return <LocalAudioTrack>tracks[0];
}
