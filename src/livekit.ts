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
import { version } from './version';

const isSupported = true;

const connect = function (
  info: ConnectionInfo,
  token: string,
  options?: ConnectOptions
): Promise<Room> {
  const client = new RTCClientImpl();
  const room = new Room(client);

  let level: LogLevel = LogLevel.info;
  if (options && options.logLevel) {
    level = options.logLevel;
  }
  log.setLevel(level);

  // connect to room
  return room.connect(info, token);
};

async function createLocalVideoTrack(
  options?: CreateLocalTrackOptions
): Promise<LocalVideoTrack> {
  const tracks = await createLocalTracks({
    logLevel: options?.logLevel,
    audio: false,
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
    video: false,
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

export {
  connect,
  createLocalTracks,
  createLocalAudioTrack,
  createLocalVideoTrack,
  version,
  isSupported,
};
