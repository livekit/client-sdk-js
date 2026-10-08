import { defaultVideoCodec } from '../defaults';
import { DeviceUnsupportedError, TrackInvalidError } from '../errors';
import LocalAudioTrack from '../track/LocalAudioTrack';
import type LocalTrack from '../track/LocalTrack';
import LocalVideoTrack from '../track/LocalVideoTrack';
import { Track } from '../track/Track';
import { type VideoCapture, createLocalTracks, setVideoCapture } from '../track/create';
import type {
  ScreenShareCaptureOptions,
  TrackPublishDefaults,
  VideoCaptureOptions,
  VideoEncoding,
} from '../track/options';
import { ScreenSharePresets, VideoPresets } from '../track/options';
import { screenCaptureToDisplayMediaStreamOptions } from '../track/utils';
import { isSafari17Based } from '../utils';

export const videoDefaults: VideoCaptureOptions = {
  deviceId: { ideal: 'default' },
  resolution: VideoPresets.h720.resolution,
};

/** The video part of `publishDefaults`; the `video` extension merges it under the room options. */
export const videoPublishDefaults = {
  simulcast: true,
  screenShareEncoding: ScreenSharePresets.h1080fps15.encoding as VideoEncoding,
  videoCodec: defaultVideoCodec,
  backupCodec: true,
} as const satisfies Partial<TrackPublishDefaults>;

const videoCapture: VideoCapture = {
  defaults: videoDefaults,
  createTrack: (mediaStreamTrack, constraints, userProvidedTrack, loggerOptions) =>
    new LocalVideoTrack(mediaStreamTrack, constraints, userProvidedTrack, loggerOptions),
};

/** Lets `createLocalTracks` and `publishTrack` produce video tracks. Safe to call repeatedly. */
export function registerVideoCapture() {
  setVideoCapture(videoCapture);
}

/**
 * Creates a [[LocalVideoTrack]] with getUserMedia()
 * @param options
 */
export async function createLocalVideoTrack(
  options?: VideoCaptureOptions,
): Promise<LocalVideoTrack> {
  registerVideoCapture();
  const tracks = await createLocalTracks({
    audio: false,
    video: options ?? true,
  });
  return <LocalVideoTrack>tracks[0];
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
  if (options.resolution === undefined && !isSafari17Based()) {
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
