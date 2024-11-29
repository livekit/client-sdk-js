import DeviceManager from '../DeviceManager';
import { audioDefaults, videoDefaults } from '../defaults';
import { DeviceUnsupportedError, TrackInvalidError } from '../errors';
import { mediaTrackToLocalTrack } from '../participant/publishUtils';
import { isSafari17 } from '../utils';
import LocalAudioTrack from './LocalAudioTrack';
import type LocalTrack from './LocalTrack';
import LocalVideoTrack from './LocalVideoTrack';
import { Track } from './Track';
import type {
  AudioCaptureOptions,
  CreateLocalTracksOptions,
  ScreenShareCaptureOptions,
  VideoCaptureOptions,
} from './options';
import { ScreenSharePresets } from './options';
import {
  constraintsForOptions,
  extractProcessorsFromOptions,
  mergeDefaultOptions,
  screenCaptureToDisplayMediaStreamOptions,
} from './utils';

/**
 * Creates a local video and audio track at the same time. When acquiring both
 * audio and video tracks together, it'll display a single permission prompt to
 * the user instead of two separate ones.
 * @param options
 */
export async function createLocalTracks(
  options?: CreateLocalTracksOptions,
): Promise<Array<LocalTrack>> {
  // set default options to true
  options ??= {};
  options.audio ??= true;
  options.video ??= true;

  const { audioProcessor, videoProcessor } = extractProcessorsFromOptions(options);
  const opts = mergeDefaultOptions(options, audioDefaults, videoDefaults);
  const constraints = constraintsForOptions(opts);

  // Keep a reference to the promise on DeviceManager and await it in getLocalDevices()
  // works around iOS Safari Bug https://bugs.webkit.org/show_bug.cgi?id=179363
  const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);

  if (options.audio) {
    DeviceManager.userMediaPromiseMap.set('audioinput', mediaPromise);
    mediaPromise.catch(() => DeviceManager.userMediaPromiseMap.delete('audioinput'));
  }
  if (options.video) {
    DeviceManager.userMediaPromiseMap.set('videoinput', mediaPromise);
    mediaPromise.catch(() => DeviceManager.userMediaPromiseMap.delete('videoinput'));
  }

  const stream = await mediaPromise;
  return Promise.all(
    stream.getTracks().map(async (mediaStreamTrack) => {
      const isAudio = mediaStreamTrack.kind === 'audio';
      let trackOptions = isAudio ? opts!.audio : opts!.video;
      if (typeof trackOptions === 'boolean' || !trackOptions) {
        trackOptions = {};
      }
      let trackConstraints: MediaTrackConstraints | undefined;
      const conOrBool = isAudio ? constraints.audio : constraints.video;
      if (typeof conOrBool !== 'boolean') {
        trackConstraints = conOrBool;
      }

      // update the constraints with the device id the user gave permissions to in the permission prompt
      // otherwise each track restart (e.g. mute - unmute) will try to initialize the device again -> causing additional permission prompts
      if (trackConstraints) {
        trackConstraints.deviceId = mediaStreamTrack.getSettings().deviceId;
      } else {
        trackConstraints = { deviceId: mediaStreamTrack.getSettings().deviceId };
      }

      const track = mediaTrackToLocalTrack(mediaStreamTrack, trackConstraints);
      if (track.kind === Track.Kind.Video) {
        track.source = Track.Source.Camera;
      } else if (track.kind === Track.Kind.Audio) {
        track.source = Track.Source.Microphone;
      }
      track.mediaStream = stream;
      if (track instanceof LocalAudioTrack && audioProcessor) {
        await track.setProcessor(audioProcessor);
      } else if (track instanceof LocalVideoTrack && videoProcessor) {
        await track.setProcessor(videoProcessor);
      }

      return track;
    }),
  );
}

/**
 * Creates a [[LocalVideoTrack]] with getUserMedia()
 * @param options
 */
export async function createLocalVideoTrack(
  options?: VideoCaptureOptions,
): Promise<LocalVideoTrack> {
  const tracks = await createLocalTracks({
    audio: false,
    video: options,
  });
  return <LocalVideoTrack>tracks[0];
}

export async function createLocalAudioTrack(
  options?: AudioCaptureOptions,
): Promise<LocalAudioTrack> {
  const tracks = await createLocalTracks({
    audio: options,
    video: false,
  });
  return <LocalAudioTrack>tracks[0];
}

/**
 * Creates a screen capture tracks with getDisplayMedia().
 * A LocalVideoTrack is always created and returned.
 * If { audio: true }, and the browser supports audio capture, a LocalAudioTrack is also created.
 */
export async function createLocalScreenTracks(
  options?: ScreenShareCaptureOptions,
): Promise<Array<LocalTrack>> {
  if (options === undefined) {
    options = {};
  }
  if (options.resolution === undefined && !isSafari17()) {
    options.resolution = ScreenSharePresets.h1080fps30.resolution;
  }

  if (navigator.mediaDevices.getDisplayMedia === undefined) {
    throw new DeviceUnsupportedError('getDisplayMedia not supported');
  }

  const constraints = screenCaptureToDisplayMediaStreamOptions(options);
  const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia(constraints);

  const tracks = stream.getVideoTracks();
  if (tracks.length === 0) {
    throw new TrackInvalidError('no video track found');
  }
  const screenVideo = new LocalVideoTrack(tracks[0], undefined, false);
  screenVideo.source = Track.Source.ScreenShare;
  const localTracks: Array<LocalTrack> = [screenVideo];
  if (stream.getAudioTracks().length > 0) {
    const screenAudio = new LocalAudioTrack(stream.getAudioTracks()[0], undefined, false);
    screenAudio.source = Track.Source.ScreenShareAudio;
    localTracks.push(screenAudio);
  }
  return localTracks;
}
