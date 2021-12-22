import { LogLevel, LogLevelDesc } from './logger';
import {
  AudioCaptureOptions, CreateLocalTracksOptions, TrackPublishDefaults, VideoCaptureOptions,
} from './room/track/options';

/**
 * Options for when creating a new room
 */
export interface RoomOptions {
  /**
   * automatically manage quality of subscribed video tracks, subscribe to the
   * an appropriate resolution based on the size of the video elements that
   * tracks are attached to.
   *
   * also observes the visibility of attached tracks and pauses receiving data
   * if they are not visible. when an attached element becomes visible again,
   * the track resumes receiving data.
   */
  autoManageVideo?: boolean;

  /**
   * default options to use when capturing user's audio
   */
  audioCaptureDefaults?: AudioCaptureOptions;

  /**
   * default options to use when capturing user's video
   */
  videoCaptureDefaults?: VideoCaptureOptions;

  /**
   * default options to use when publishing tracks
   */
  publishDefaults?: TrackPublishDefaults;

  /**
   * should local tracks be stopped when they are unpublished. defaults to true
   * set this to false if you would prefer to clean up unpublished local tracks manually.
   */
  stopLocalTrackOnUnpublish?: boolean;

  /**
   * @internal
   * experimental flag, disable client managed layer pause when publishing capability is limited
   */
  expDisableLayerPause?: boolean;
}

/**
 * Options for Room.connect()
 */
export interface RoomConnectOptions {
  /** autosubscribe to room tracks after joining, defaults to true */
  autoSubscribe?: boolean;

  /**
   * use to override any RTCConfiguration options.
   */
  rtcConfig?: RTCConfiguration;
}

/**
 * if video or audio tracks are created as part of [[connect]], it'll automatically
 * publish those tracks to the room.
 */
export interface ConnectOptions extends CreateLocalTracksOptions {
  /** autosubscribe to room tracks upon connect, defaults to true */
  autoSubscribe?: boolean;

  /**
   * automatically manage quality of subscribed video tracks, subscribe to the
   * an appropriate resolution based on the size of the video elements that tracks
   * are attached to.
   *
   * also observes the visibility of attached tracks and pauses receiving data
   * if they are not visible.
   *
   */
  autoManageVideo?: boolean;

  /** configures LiveKit internal log level */
  logLevel?: LogLevel | LogLevelDesc;

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
   * default options to use when capturing user's audio
   */
  audioCaptureDefaults?: AudioCaptureOptions;

  /**
   * default options to use when capturing user's video
   */
  videoCaptureDefaults?: VideoCaptureOptions;

  /**
   * default options to use when publishing tracks
   */
  publishDefaults?: TrackPublishDefaults;

  /**
   * should local tracks be stopped when they are unpublished. defaults to true
   * set this to false if you would prefer to clean up unpublished local tracks manually.
   */
  stopLocalTrackOnUnpublish?: boolean;

  /**
   * @internal
   * experimental flag, disable client managed layer pause when publishing capability is limited
   */
  expDisableLayerPause?: boolean;
}
