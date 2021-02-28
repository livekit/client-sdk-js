import log from 'loglevel';
import { WSSignalClient } from './api/SignalClient';
import {
  ConnectOptions,
  CreateAudioTrackOptions,
  CreateLocalTrackOptions,
  CreateLocalTracksOptions,
  CreateVideoTrackOptions,
  LogLevel,
  VideoPresets,
} from './options';
import { TrackInvalidError } from './room/errors';
import Room from './room/Room';
import { LocalAudioTrack } from './room/track/LocalAudioTrack';
import { LocalVideoTrack } from './room/track/LocalVideoTrack';
import { TrackPublishOptions } from './room/track/options';
import { Track } from './room/track/Track';
import { LocalTrack } from './room/track/types';
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
  options?: ConnectOptions
): Promise<Room> {
  // set defaults
  options ||= {};
  options.logLevel ||= LogLevel.info;
  if (options.audio === undefined) options.audio = false;
  if (options.video === undefined) options.video = false;

  log.setLevel(options.logLevel);

  let config: RTCConfiguration = {
    iceServers: [
      {
        urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
      },
    ],
  };
  if (options.iceServers) {
    config.iceServers = options.iceServers;
  }

  const client = new WSSignalClient();
  const room = new Room(client, config);

  // connect to room
  await room.connect(url, token);

  // add tracks if available
  let tracks = options.tracks;

  if (!tracks) {
    if (options.audio || options.video) {
      tracks = await createLocalTracks({
        audio: options.audio,
        video: options.video,
      });
    }
  }

  if (tracks) {
    room.autoTracks = [];
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      // video options
      const trackOptions: TrackPublishOptions = {};
      if (
        track.kind === Track.Kind.Video.toString() ||
        track.kind === Track.Kind.Video
      ) {
        trackOptions.videoCodec = options?.videoCodec;
        trackOptions.videoEncoding = options?.videoEncoding;
        trackOptions.simulcast = options?.simulcast;
      }

      const publication = await room.localParticipant.publishTrack(
        track,
        trackOptions
      );
      room.autoTracks.push(publication);
    }
  }

  return room;
}

/**
 * Creates a [[LocalVideoTrack]] with getUserMedia()
 * @param options
 */
export async function createLocalVideoTrack(
  options?: CreateVideoTrackOptions
): Promise<LocalVideoTrack> {
  const tracks = await createLocalTracks({
    audio: false,
    video: options,
  });
  return <LocalVideoTrack>tracks[0];
}

export async function createLocalAudioTrack(
  options?: CreateAudioTrackOptions
): Promise<LocalAudioTrack> {
  const tracks = await createLocalTracks({
    audio: options,
    video: false,
  });
  return <LocalAudioTrack>tracks[0];
}

/**
 * creates a local video and audio track at the same time
 * @param options
 */
export async function createLocalTracks(
  options?: CreateLocalTracksOptions
): Promise<Array<LocalTrack>> {
  const constraints: MediaStreamConstraints = {};
  if (!options) options = {};
  if (options.audio === undefined) options.audio = {};

  // default video options
  let videoOptions: MediaTrackConstraints = Object.assign(
    {},
    VideoPresets.qhd.resolution
  );
  if (typeof options.video === 'object' && options.video) {
    Object.assign(videoOptions, options.video);
    if (options.video.resolution) {
      Object.assign(videoOptions, options.video.resolution);
    }
  }

  if (options.video === false) {
    constraints.video = false;
  } else {
    // use defaults
    constraints.video = videoOptions;
  }
  log.debug('video constraints', constraints.video);
  constraints.audio = options.audio;

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const tracks: LocalTrack[] = [];
  stream.getTracks().forEach((mediaStreamTrack) => {
    let trackOptions =
      mediaStreamTrack.kind === 'audio' ? options!.audio : options!.video;
    if (typeof trackOptions === 'boolean' || !trackOptions) {
      trackOptions = {};
    }
    tracks.push(createLocalTrack(mediaStreamTrack, trackOptions));
  });

  return tracks;
}

/** @internal */
function createLocalTrack(
  mediaStreamTrack: MediaStreamTrack,
  options: CreateLocalTrackOptions
): LocalTrack {
  let name: string | undefined;
  if (options instanceof Object && options.name) {
    name = options.name;
  }

  switch (mediaStreamTrack.kind) {
    case 'audio':
      return new LocalAudioTrack(mediaStreamTrack, name, options);
    case 'video':
      return new LocalVideoTrack(mediaStreamTrack, name, options);
    default:
      throw new TrackInvalidError(
        'unsupported track type: ' + mediaStreamTrack.kind
      );
  }
}
