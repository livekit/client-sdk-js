import LocalTrack from './room/track/LocalTrack';
import { CreateLocalTracksOptions, VideoCodec, VideoEncoding } from './room/track/options';

/**
 * if video or audio tracks are created as part of [[connect]], it'll automatically
 * publish those tracks to the room.
 */
export interface ConnectOptions extends CreateLocalTracksOptions {
  /** autosubscribe to room tracks upon connect, defaults to true */
  autoSubscribe?: boolean;

  /** configures LiveKit internal log level */
  logLevel?: LogLevel;

  /**
   * set ICE servers. When deployed correctly, LiveKit automatically uses the built-in TURN servers
   */
  iceServers?: RTCIceServer[];

  /**
   * use to override any RTCConfiguration options.
   */
  rtcConfig?: RTCConfiguration;

  /**
   * Tracks to publish to the room after joining. These can be obtained by calling
   * [[createLocalTracks]]. when this is passed in, it'll ignore audio and video options
   */
  tracks?: LocalTrack[] | MediaStreamTrack[];

  /** default [[TrackPublishOptions.videoEncoding]] for published tracks */
  videoEncoding?: VideoEncoding;

  /** default [[TrackPublishOptions.videoCodec]] for published tracks */
  videoCodec?: VideoCodec;

  /** default [[TrackPublishOptions.audioBitrate]] for published tracks */
  audioBitrate?: number;

  /** see [[TrackPublishOptions.dtx]] */
  dtx?: boolean;

  /** see [[TrackPublishOptions.simulcast]] */
  simulcast?: boolean;
}

export enum LogLevel {
  trace = 'trace',
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
  silent = 'silent',
}
