import {
  CreateLocalTracksOptions, TrackCaptureDefaults, TrackPublishDefaults,
} from './room/track/options';

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
   * capture and publish audio track on connect, defaults to false
   *
   * If this option is used, you will not be notified if user denies capture permission.
   */
  audio?: boolean;

  /**
   * capture and publish video track on connect, defaults to false
   *
   * If this option is used, you will not be notified if user denies capture permission.
   */
  video?: boolean;

  /**
   * default options to use when capturing user media
   */
  captureDefaults?: TrackCaptureDefaults;

  /**
   * default options to use when publishing tracks
   */
  publishDefaults?: TrackPublishDefaults;
}

export enum LogLevel {
  trace = 'trace',
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
  silent = 'silent',
}
