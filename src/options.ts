import { LocalTrack } from './room/track/types';

export interface ConnectOptions {
  // default to true, publishes audio track with getUserMedia automatically on connect
  // false to disable this behavior
  audio?: boolean | CreateLocalTrackOptions;
  // default to true, publishes video track with getUserMedia automatically on connect
  // false to disable this behavior
  video?: boolean | CreateLocalTrackOptions;
  logLevel?: LogLevel;
  iceServers?: RTCIceServer[];
  // the LocalTracks or MediaStreamTracks to publish after joining
  // these can be obtained by calling createLocalTracks
  // when this is passed in, it'll ignore audio and video options
  tracks?: LocalTrack[] | MediaStreamTrack[];
}

export enum LogLevel {
  trace = 'trace',
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
  silent = 'silent',
}

export interface CreateLocalTracksOptions {
  audio?: boolean | CreateLocalTrackOptions;
  logLevel?: LogLevel;
  video?: boolean | CreateLocalTrackOptions;
}

export interface CreateLocalTrackOptions extends MediaTrackConstraints {
  logLevel?: LogLevel;
  name?: string;
}
