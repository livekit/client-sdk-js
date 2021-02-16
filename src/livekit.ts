import log from 'loglevel';
import { ConnectionInfo, WSSignalClient } from './api/SignalClient';
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
import { LocalTrackOptions } from './room/track/options';
import { Track } from './room/track/Track';
import { LocalTrack } from './room/track/types';
export { version } from './version';

export const isSupported = true;

export async function connect(
  info: ConnectionInfo,
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
  await room.connect(info, token);

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
      const trackOptions: LocalTrackOptions = {};
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

export async function createLocalVideoTrack(
  options?: CreateVideoTrackOptions
): Promise<LocalVideoTrack> {
  const tracks = await createLocalTracks({
    logLevel: options?.logLevel,
    audio: false,
    video: options,
  });
  return <LocalVideoTrack>tracks[0];
}

export async function createLocalAudioTrack(
  options?: CreateAudioTrackOptions
): Promise<LocalAudioTrack> {
  const tracks = await createLocalTracks({
    logLevel: options?.logLevel,
    audio: options,
    video: false,
  });
  return <LocalAudioTrack>tracks[0];
}

export async function createLocalTracks(
  options?: CreateLocalTracksOptions
): Promise<Array<LocalTrack>> {
  const constraints: MediaStreamConstraints = {};
  if (!options) options = {};
  if (options.audio === undefined) options.audio = {};

  // default video options
  let videoOptions: CreateVideoTrackOptions = {
    resolution: VideoPresets.hd.resolution,
  };
  if (typeof options.video === 'object') {
    Object.assign(videoOptions, options.video);
  }

  if (options.video === false) {
    constraints.video = false;
  } else {
    // use defaults
    constraints.video = videoOptions;
  }
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
