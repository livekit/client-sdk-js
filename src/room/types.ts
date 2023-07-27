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

import type RemoteParticipant from './participant/RemoteParticipant';

export type SimulationOptions = {
  publish?: {
    audio?: boolean;
    video?: boolean;
    useRealTracks?: boolean;
  };
  participants?: {
    count?: number;
    aspectRatios?: Array<number>;
    audio?: boolean;
    video?: boolean;
  };
};

export type DataPublishOptions = {
  /** the participants who will receive the message, will be sent to every one if empty */
  destination?: RemoteParticipant[] | string[];
  /** the topic under which the message gets published */
  topic?: string;
};

export type LiveKitReactNativeInfo = {
  // Corresponds to RN's PlatformOSType
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'web' | 'native';
  devicePixelRatio: number;
};

export type SimulationScenario =
  | 'signal-reconnect'
  | 'speaker'
  | 'node-failure'
  | 'server-leave'
  | 'migration'
  | 'resume-reconnect'
  | 'force-tcp'
  | 'force-tls'
  | 'full-reconnect';
