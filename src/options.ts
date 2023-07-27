/**
 * Copyright 2023 LiveKit, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { E2EEOptions } from './e2ee/types';
import type { ReconnectPolicy } from './room/ReconnectPolicy';
import type {
  AudioCaptureOptions,
  AudioOutputOptions,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from './room/track/options';
import type { AdaptiveStreamSettings } from './room/track/types';

export interface WebAudioSettings {
  audioContext: AudioContext;
}

/**
 * @internal
 */
export interface InternalRoomOptions {
  /**
   * AdaptiveStream lets LiveKit automatically manage quality of subscribed
   * video tracks to optimize for bandwidth and CPU.
   * When attached video elements are visible, it'll choose an appropriate
   * resolution based on the size of largest video element it's attached to.
   *
   * When none of the video elements are visible, it'll temporarily pause
   * the data flow until they are visible again.
   */
  adaptiveStream: AdaptiveStreamSettings | boolean;

  /**
   * enable Dynacast, off by default. With Dynacast dynamically pauses
   * video layers that are not being consumed by any subscribers, significantly
   * reducing publishing CPU and bandwidth usage.
   */
  dynacast: boolean;

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
   * audio output for the room
   */
  audioOutput?: AudioOutputOptions;

  /**
   * should local tracks be stopped when they are unpublished. defaults to true
   * set this to false if you would prefer to clean up unpublished local tracks manually.
   */
  stopLocalTrackOnUnpublish: boolean;

  /**
   * policy to use when attempting to reconnect
   */
  reconnectPolicy: ReconnectPolicy;

  /**
   * specifies whether the sdk should automatically disconnect the room
   * on 'pagehide' and 'beforeunload' events
   */
  disconnectOnPageLeave: boolean;

  /**
   * @internal
   * experimental flag, introduce a delay before sending signaling messages
   */
  expSignalLatency?: number;

  /**
   * @internal
   * @experimental
   * experimental flag, mix all audio tracks in web audio
   */

  expWebAudioMix: boolean | WebAudioSettings;

  /**
   * @experimental
   */
  e2ee?: E2EEOptions;
}

/**
 * Options for when creating a new room
 */
export interface RoomOptions extends Partial<InternalRoomOptions> {}

/**
 * @internal
 */
export interface InternalRoomConnectOptions {
  /** autosubscribe to room tracks after joining, defaults to true */
  autoSubscribe: boolean;

  /** amount of time for PeerConnection to be established, defaults to 15s */
  peerConnectionTimeout: number;

  /**
   * use to override any RTCConfiguration options.
   */
  rtcConfig?: RTCConfiguration;

  /**
   * @deprecated
   * publish only mode
   */
  publishOnly?: string;

  /** specifies how often an initial join connection is allowed to retry (only applicable if server is not reachable) */
  maxRetries: number;
}

/**
 * Options for Room.connect()
 */
export interface RoomConnectOptions extends Partial<InternalRoomConnectOptions> {}
