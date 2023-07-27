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

import type { InternalRoomConnectOptions, InternalRoomOptions } from '../options';
import DefaultReconnectPolicy from './DefaultReconnectPolicy';
import { AudioPresets, ScreenSharePresets, VideoPresets } from './track/options';
import type {
  AudioCaptureOptions,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from './track/options';

export const publishDefaults: TrackPublishDefaults = {
  /**
   * @deprecated
   */
  audioBitrate: AudioPresets.music.maxBitrate,
  audioPreset: AudioPresets.music,
  dtx: true,
  red: true,
  forceStereo: false,
  simulcast: true,
  screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
  stopMicTrackOnMute: false,
  videoCodec: 'vp8',
  backupCodec: false,
} as const;

export const audioDefaults: AudioCaptureOptions = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
};

export const videoDefaults: VideoCaptureOptions = {
  resolution: VideoPresets.h720.resolution,
};

export const roomOptionDefaults: InternalRoomOptions = {
  adaptiveStream: false,
  dynacast: false,
  stopLocalTrackOnUnpublish: true,
  reconnectPolicy: new DefaultReconnectPolicy(),
  disconnectOnPageLeave: true,
  expWebAudioMix: false,
} as const;

export const roomConnectOptionDefaults: InternalRoomConnectOptions = {
  autoSubscribe: true,
  maxRetries: 1,
  peerConnectionTimeout: 15_000,
} as const;
