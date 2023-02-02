import DeviceManager from '../DeviceManager';
import { DeviceUnsupportedError, TrackInvalidError } from '../errors';
import { mediaTrackToLocalTrack } from '../participant/publishUtils';
import { audioDefaults, videoDefaults } from '../defaults';
import LocalAudioTrack from './LocalAudioTrack';
import type LocalTrack from './LocalTrack';
import LocalVideoTrack from './LocalVideoTrack';
import {
  AudioCaptureOptions,
  CreateLocalTracksOptions,
  ScreenShareCaptureOptions,
  VideoCaptureOptions,
  VideoPresets,
} from './options';
import { Track } from './Track';
import { constraintsForOptions, mergeDefaultOptions } from './utils';

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
  return stream.getTracks().map((mediaStreamTrack) => {
    const isAudio = mediaStreamTrack.kind === 'audio';
    let trackOptions = isAudio ? options!.audio : options!.video;
    if (typeof trackOptions === 'boolean' || !trackOptions) {
      trackOptions = {};
    }
    let trackConstraints: MediaTrackConstraints | undefined;
    const conOrBool = isAudio ? constraints.audio : constraints.video;
    if (typeof conOrBool !== 'boolean') {
      trackConstraints = conOrBool;
    }
    const track = mediaTrackToLocalTrack(mediaStreamTrack, trackConstraints);
    if (track.kind === Track.Kind.Video) {
      track.source = Track.Source.Camera;
    } else if (track.kind === Track.Kind.Audio) {
      track.source = Track.Source.Microphone;
    }
    track.mediaStream = stream;
    return track;
  });
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
  if (options.resolution === undefined) {
    options.resolution = VideoPresets.h1080.resolution;
  }

  let videoConstraints: MediaTrackConstraints | boolean = true;
  if (options.resolution) {
    videoConstraints = {
      width: options.resolution.width,
      height: options.resolution.height,
    };
  }

  if (navigator.mediaDevices.getDisplayMedia === undefined) {
    throw new DeviceUnsupportedError('getDisplayMedia not supported');
  }

  // typescript definition is missing getDisplayMedia: https://github.com/microsoft/TypeScript/issues/33232
  // @ts-ignore
  const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia({
    audio: options.audio ?? false,
    video: videoConstraints,
  });

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
