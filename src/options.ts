import {
  AudioCaptureOptions,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from './room/track/options';
import { AdaptiveStreamSettings } from './room/track/types';
import { IReconnectPolicy } from './room/IReconnectPolicy';

/**
 * Options for when creating a new room
 */
export interface RoomOptions {
  /**
   * AdaptiveStream lets LiveKit automatically manage quality of subscribed
   * video tracks to optimize for bandwidth and CPU.
   * When attached video elements are visible, it'll choose an appropriate
   * resolution based on the size of largest video element it's attached to.
   *
   * When none of the video elements are visible, it'll temporarily pause
   * the data flow until they are visible again.
   */
  adaptiveStream?: AdaptiveStreamSettings | boolean;

  /**
   * enable Dynacast, off by default. With Dynacast dynamically pauses
   * video layers that are not being consumed by any subscribers, significantly
   * reducing publishing CPU and bandwidth usage.
   */
  dynacast?: boolean;

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
   * experimental flag, introduce a delay before sending signaling messages
   */
  expSignalLatency?: number;

  /**
   * policy to use when attempting to reconnect
   */
  reconnectPolicy?: IReconnectPolicy;
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

  /**
   * publish only mode
   */
  publishOnly?: string;
}
