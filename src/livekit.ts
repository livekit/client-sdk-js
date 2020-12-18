import { ConnectionInfo, JoinOptions, RTCClientImpl } from './api/rtcClient';
import { TrackInvalidError } from './room/errors';
import Room from './room/room';
import { LocalAudioTrack, LocalTrack, LocalVideoTrack } from './room/track';

const connect = function (
  info: ConnectionInfo,
  roomId: string,
  token: string,
  options?: JoinOptions
): Promise<Room> {
  const client = new RTCClientImpl();
  const room = new Room(client, roomId);

  // connect to room
  return room.connect(info, token, options);
};

export enum LogLevel {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
  off = 'off',
}

export interface CreateLocalTracksOptions {
  audio?: boolean | CreateLocalTrackOptions;
  logLevel?: LogLevel;
  video?: boolean | CreateLocalTrackOptions;
}

export interface CreateLocalTrackOptions {
  logLevel?: LogLevel;
  name?: string;
}

async function createLocalVideoTrack(
  options?: CreateLocalTrackOptions
): Promise<LocalVideoTrack> {
  const tracks = await createLocalTracks({
    logLevel: options?.logLevel,
    video: options,
  });
  return <LocalVideoTrack>tracks[0];
}

async function createLocalAudioTrack(
  options?: CreateLocalTrackOptions
): Promise<LocalAudioTrack> {
  const tracks = await createLocalTracks({
    logLevel: options?.logLevel,
    audio: options,
  });
  return <LocalAudioTrack>tracks[0];
}

async function createLocalTracks(
  options?: CreateLocalTracksOptions
): Promise<Array<LocalTrack>> {
  const constraints: MediaStreamConstraints = {};
  if (!options) options = {};
  if (options.audio === undefined) options.audio = true;
  if (options.video === undefined) options.video = true;

  if (options.video) {
    constraints.video = { facingMode: 'user' };
  }
  if (options.audio) {
    constraints.audio = true;
  }

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const tracks: LocalTrack[] = [];
  stream.getTracks().forEach((mediaStreamTrack) => {
    console.debug('created local track', mediaStreamTrack);
    const trackOptions =
      mediaStreamTrack.kind === 'audio' ? options!.audio : options!.video;
    tracks.push(createLocalTrack(mediaStreamTrack, trackOptions!));
  });

  console.debug('created tracks', tracks);
  return tracks;
}

function createLocalTrack(
  mediaStreamTrack: MediaStreamTrack,
  options: boolean | CreateLocalTrackOptions
): LocalTrack {
  let name: string | undefined;
  if (options instanceof Object && options.name) {
    name = options.name;
  }

  switch (mediaStreamTrack.kind) {
    case 'audio':
      return new LocalAudioTrack(mediaStreamTrack, name);
    case 'video':
      return new LocalVideoTrack(mediaStreamTrack, name);
    default:
      throw new TrackInvalidError(
        'unsupported track type: ' + mediaStreamTrack.kind
      );
  }
}

export {
  connect,
  createLocalTracks,
  createLocalAudioTrack,
  createLocalVideoTrack,
};
