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

import { LogLevel, setLogExtension, setLogLevel } from './logger';
import { DataPacket_Kind, DisconnectReason, VideoQuality } from './proto/livekit_models_pb';
import DefaultReconnectPolicy from './room/DefaultReconnectPolicy';
import Room, { ConnectionState, RoomState } from './room/Room';
import LocalParticipant from './room/participant/LocalParticipant';
import Participant, { ConnectionQuality } from './room/participant/Participant';
import type { ParticipantTrackPermission } from './room/participant/ParticipantTrackPermission';
import RemoteParticipant from './room/participant/RemoteParticipant';
import CriticalTimers from './room/timers';
import LocalAudioTrack from './room/track/LocalAudioTrack';
import LocalTrack from './room/track/LocalTrack';
import LocalTrackPublication from './room/track/LocalTrackPublication';
import LocalVideoTrack from './room/track/LocalVideoTrack';
import RemoteAudioTrack from './room/track/RemoteAudioTrack';
import RemoteTrack from './room/track/RemoteTrack';
import RemoteTrackPublication from './room/track/RemoteTrackPublication';
import type { ElementInfo } from './room/track/RemoteVideoTrack';
import RemoteVideoTrack from './room/track/RemoteVideoTrack';
import { TrackPublication } from './room/track/TrackPublication';
import type { LiveKitReactNativeInfo } from './room/types';
import type { AudioAnalyserOptions } from './room/utils';
import {
  createAudioAnalyser,
  getEmptyAudioStreamTrack,
  getEmptyVideoStreamTrack,
  isBrowserSupported,
  supportsAV1,
  supportsAdaptiveStream,
  supportsDynacast,
  supportsVP9,
} from './room/utils';

export * from './connectionHelper/ConnectionCheck';
export * from './options';
export * from './room/errors';
export * from './room/events';
export * from './room/track/Track';
export * from './room/track/create';
export * from './room/track/options';
export { facingModeFromDeviceLabel, facingModeFromLocalTrack } from './room/track/facingMode';
export * from './room/track/types';
export type { DataPublishOptions, SimulationScenario } from './room/types';
export * from './version';
export * from './e2ee';
export * from './room/track/processor/types';
export {
  setLogLevel,
  setLogExtension,
  getEmptyAudioStreamTrack,
  getEmptyVideoStreamTrack,
  isBrowserSupported,
  supportsAdaptiveStream,
  supportsDynacast,
  supportsAV1,
  supportsVP9,
  createAudioAnalyser,
  LogLevel,
  Room,
  ConnectionState,
  RoomState,
  DataPacket_Kind,
  DisconnectReason,
  Participant,
  RemoteParticipant,
  LocalParticipant,
  LocalAudioTrack,
  LocalVideoTrack,
  LocalTrack,
  LocalTrackPublication,
  RemoteTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
  RemoteTrackPublication,
  TrackPublication,
  VideoQuality,
  ConnectionQuality,
  DefaultReconnectPolicy,
  CriticalTimers,
};
export type {
  ElementInfo,
  ParticipantTrackPermission,
  AudioAnalyserOptions,
  LiveKitReactNativeInfo,
};
