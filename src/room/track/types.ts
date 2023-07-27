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

import type LocalAudioTrack from './LocalAudioTrack';
import type LocalVideoTrack from './LocalVideoTrack';
import type RemoteAudioTrack from './RemoteAudioTrack';
import type RemoteVideoTrack from './RemoteVideoTrack';

export type AudioTrack = RemoteAudioTrack | LocalAudioTrack;
export type VideoTrack = RemoteVideoTrack | LocalVideoTrack;

export type AdaptiveStreamSettings = {
  /**
   * Set a custom pixel density. Defaults to 2 for high density screens (3+) or
   * 1 otherwise.
   * When streaming videos on a ultra high definition screen this setting
   * let's you account for the devicePixelRatio of those screens.
   * Set it to `screen` to use the actual pixel density of the screen
   * Note: this might significantly increase the bandwidth consumed by people
   * streaming on high definition screens.
   */
  pixelDensity?: number | 'screen';
  /**
   * If true, video gets paused when switching to another tab.
   * Defaults to true.
   */
  pauseVideoInBackground?: boolean;
};
