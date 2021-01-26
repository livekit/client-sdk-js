import log from 'loglevel';
import { ConnectionInfo, RTCClientImpl } from './api/RTCClient';
import {
  ConnectOptions,
  CreateLocalTrackOptions,
  CreateLocalTracksOptions,
  LogLevel,
} from './options';
import { TrackInvalidError } from './room/errors';
import Room from './room/Room';
import { LocalAudioTrack } from './room/track/LocalAudioTrack';
import { LocalVideoTrack } from './room/track/LocalVideoTrack';
import { LocalTrack } from './room/track/types';
export { version } from './version';

export const isSupported = true;

export async function connect(
  info: ConnectionInfo,
  token: string,
  options?: ConnectOptions
): Promise<Room> {
  const client = new RTCClientImpl();
  const room = new Room(client);

  // set defaults
  options ||= {};
  options.logLevel ||= LogLevel.info;
  if (options.audio === undefined) options.audio = true;
  if (options.video === undefined) options.video = true;

  log.setLevel(options.logLevel);

  if (options.iceServers) {
    room.engine.peerConn.setConfiguration({
      iceServers: options.iceServers,
    });
  }

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
    // save these tracks so room can stop upon disconnect
    room.autoTracks = await room.localParticipant.publishTracks(tracks);
  }

  return room;
}

export async function createLocalVideoTrack(
  options?: CreateLocalTrackOptions
): Promise<LocalVideoTrack> {
  const tracks = await createLocalTracks({
    logLevel: options?.logLevel,
    audio: false,
    video: options,
  });
  return <LocalVideoTrack>tracks[0];
}

export async function createLocalAudioTrack(
  options?: CreateLocalTrackOptions
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
  if (options.audio === undefined) options.audio = true;
  if (options.video === undefined) options.video = true;

  if (options.video) {
    constraints.video = options.video;
  }
  if (options.audio) {
    constraints.audio = options.audio;
  }

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

  log.debug('created tracks', tracks);
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
