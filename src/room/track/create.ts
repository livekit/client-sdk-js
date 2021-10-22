import { TrackInvalidError } from '../errors';
import LocalAudioTrack from './LocalAudioTrack';
import LocalTrack from './LocalTrack';
import LocalVideoTrack from './LocalVideoTrack';
import {
  CreateAudioTrackOptions, CreateLocalTracksOptions, CreateScreenTrackOptions,
  CreateVideoTrackOptions, VideoPresets,
} from './options';
import { Track } from './Track';

let audioAllowed: boolean | undefined;
export function isAudioCaptureAllowed(): boolean | undefined {
  return audioAllowed;
}

let videoAllowed: boolean | undefined;
export function isVideoCaptureAllowed(): boolean | undefined {
  return videoAllowed;
}

/**
 * creates a local video and audio track at the same time
 * @param options
 */
export async function createLocalTracks(
  options?: CreateLocalTracksOptions,
): Promise<Array<LocalTrack>> {
  if (!options) options = {};
  if (options.audio === false) options.audio = {};
  if (options.video !== false) options.video = {};

  const constraints = LocalTrack.constraintsForOptions(options);
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      constraints,
    );
  } catch (e) {
    if (e instanceof DOMException && e.name === 'NotAllowedError') {
      if (options.audio) {
        audioAllowed = false;
      }
      if (options.video) {
        videoAllowed = false;
      }
    }
    throw e;
  }

  if (options.audio) {
    audioAllowed = true;
  }
  if (options.video) {
    videoAllowed = true;
  }

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
    const track = createLocalTrack(mediaStreamTrack, trackOptions?.name, trackConstraints);
    if (track.kind === Track.Kind.Video) {
      track.source = Track.Source.Camera;
    } else if (track.kind === Track.Kind.Audio) {
      track.source = Track.Source.Microphone;
    }
    return track;
  });
}

/**
 * Creates a [[LocalVideoTrack]] with getUserMedia()
 * @param options
 */
export async function createLocalVideoTrack(
  options?: CreateVideoTrackOptions,
): Promise<LocalVideoTrack> {
  const tracks = await createLocalTracks({
    audio: false,
    video: options,
  });
  return <LocalVideoTrack>tracks[0];
}

export async function createLocalAudioTrack(
  options?: CreateAudioTrackOptions,
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
  options?: CreateScreenTrackOptions,
): Promise<Array<LocalTrack>> {
  if (options === undefined) {
    options = {};
  }
  if (options.name === undefined) {
    options.name = 'screen';
  }
  if (options.resolution === undefined) {
    options.resolution = VideoPresets.fhd.resolution;
  }

  let videoConstraints: MediaTrackConstraints | boolean = true;
  if (options.resolution) {
    videoConstraints = {
      width: options.resolution.width,
      height: options.resolution.height,
    };
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
  const screenVideo = new LocalVideoTrack(tracks[0], options.name);
  screenVideo.source = Track.Source.ScreenShare;
  const localTracks: Array<LocalTrack> = [screenVideo];
  if (stream.getAudioTracks().length > 0) {
    localTracks.push(new LocalAudioTrack(stream.getAudioTracks()[0], options.name));
  }
  return localTracks;
}

/** @internal */
function createLocalTrack(
  mediaStreamTrack: MediaStreamTrack,
  name?: string,
  constraints?: MediaTrackConstraints,
): LocalVideoTrack | LocalAudioTrack {
  switch (mediaStreamTrack.kind) {
    case 'audio':
      return new LocalAudioTrack(mediaStreamTrack, name, constraints);
    case 'video':
      return new LocalVideoTrack(mediaStreamTrack, name, constraints);
    default:
      throw new TrackInvalidError(
        `unsupported track type: ${mediaStreamTrack.kind}`,
      );
  }
}
