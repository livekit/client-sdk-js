import log from 'loglevel';
import { WSSignalClient } from './api/SignalClient';
import {
  ConnectOptions,
  LogLevel,
} from './options';
import { TrackInvalidError } from './room/errors';
import Room from './room/Room';
import LocalAudioTrack from './room/track/LocalAudioTrack';
import LocalTrack from './room/track/LocalTrack';
import LocalVideoTrack from './room/track/LocalVideoTrack';
import {
  CreateAudioTrackOptions, CreateLocalTracksOptions, CreateScreenTrackOptions,
  CreateVideoTrackOptions, TrackPublishOptions, VideoPresets,
} from './room/track/options';
import { Track } from './room/track/Track';

export { version } from './version';

/**
 * Connects to a LiveKit room
 *
 * ```typescript
 * connect('wss://myhost.livekit.io', token, {
 *   // publish audio and video tracks on joining
 *   audio: true,
 *   video: {
 *     resolution: VideoPresets.hd,
 *     facingMode: {
 *       ideal: "user",
 *     }
 *   }
 * })
 * ```
 * @param url URL to LiveKit server
 * @param token AccessToken, a JWT token that includes authentication and room details
 * @param options
 */
export async function connect(
  url: string,
  token: string,
  options?: ConnectOptions,
): Promise<Room> {
  // set defaults
  options ||= {};
  options.logLevel ||= LogLevel.info;
  if (options.audio === undefined) options.audio = false;
  if (options.video === undefined) options.video = false;

  log.setLevel(options.logLevel);

  const config: RTCConfiguration = {};
  if (options.iceServers) {
    config.iceServers = options.iceServers;
  }

  const client = new WSSignalClient();
  const room = new Room(client, config);

  // connect to room
  await room.connect(url, token, {
    autoSubscribe: options?.autoSubscribe,
  });

  // add tracks if available
  let { tracks } = options;

  if (!tracks) {
    if (options.audio || options.video) {
      tracks = await createLocalTracks({
        audio: options.audio,
        video: options.video,
      });
    }
  }

  if (tracks) {
    for (let i = 0; i < tracks.length; i += 1) {
      const track = tracks[i];
      // translate publish options
      const trackOptions: TrackPublishOptions = {};
      if (
        track.kind === Track.Kind.Video.toString()
        || track.kind === Track.Kind.Video
      ) {
        trackOptions.videoCodec = options?.videoCodec;
        trackOptions.videoEncoding = options?.videoEncoding;
        trackOptions.simulcast = options?.simulcast;
      } else if (
        track.kind === Track.Kind.Audio.toString()
        || track.kind === Track.Kind.Audio
      ) {
        trackOptions.audioBitrate = options.audioBitrate;
      }

      await room.localParticipant.publishTrack(
        track,
        trackOptions,
      );
    }
  }

  return room;
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
 * Creates a [[LocalVideoTrack]] of screen capture with getDisplayMedia()
 */
export async function createLocalScreenTrack(
  options?: CreateScreenTrackOptions,
): Promise<LocalVideoTrack> {
  if (options === undefined) {
    options = {};
  }
  if (options.name === undefined) {
    options.name = 'screen';
  }
  if (options.resolution === undefined) {
    options.resolution = VideoPresets.fhd.resolution;
  }

  // typescript definition is missing getDisplayMedia: https://github.com/microsoft/TypeScript/issues/33232
  // @ts-ignore
  const stream: MediaStream = await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: {
      width: options.resolution.width,
      height: options.resolution.height,
    },
  });

  const tracks = stream.getVideoTracks();
  if (tracks.length === 0) {
    throw new TrackInvalidError('no video track found');
  }
  return new LocalVideoTrack(tracks[0], options.name);
}

/**
 * creates a local video and audio track at the same time
 * @param options
 */
export async function createLocalTracks(
  options?: CreateLocalTracksOptions,
): Promise<Array<LocalTrack>> {
  if (!options) options = {};
  if (options.audio === undefined) options.audio = {};

  const constraints = LocalTrack.constraintsForOptions(options);
  const stream = await navigator.mediaDevices.getUserMedia(
    constraints,
  );
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
    return createLocalTrack(mediaStreamTrack, trackOptions?.name, trackConstraints);
  });
}

/** @internal */
function createLocalTrack(
  mediaStreamTrack: MediaStreamTrack,
  name?: string,
  constraints?: MediaTrackConstraints,
): LocalTrack {
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
