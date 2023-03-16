import { LogLevel, setLogExtension, setLogLevel } from './logger';
import { DataPacket_Kind, DisconnectReason, VideoQuality } from './proto/livekit_models';
import DefaultReconnectPolicy from './room/DefaultReconnectPolicy';
import LocalParticipant from './room/participant/LocalParticipant';
import Participant, { ConnectionQuality } from './room/participant/Participant';
import type { ParticipantTrackPermission } from './room/participant/ParticipantTrackPermission';
import RemoteParticipant from './room/participant/RemoteParticipant';
import Room, { ConnectionState, RoomState } from './room/Room';
import LocalAudioTrack from './room/track/LocalAudioTrack';
import LocalTrack from './room/track/LocalTrack';
import LocalTrackPublication from './room/track/LocalTrackPublication';
import LocalVideoTrack from './room/track/LocalVideoTrack';
import RemoteAudioTrack from './room/track/RemoteAudioTrack';
import RemoteTrack from './room/track/RemoteTrack';
import RemoteTrackPublication from './room/track/RemoteTrackPublication';
import RemoteVideoTrack from './room/track/RemoteVideoTrack';
import type { ElementInfo } from './room/track/RemoteVideoTrack';
import { TrackPublication } from './room/track/TrackPublication';
import CriticalTimers from './room/timers';
import {
  getEmptyAudioStreamTrack,
  getEmptyVideoStreamTrack,
  isBrowserSupported,
  supportsAdaptiveStream,
  supportsAV1,
  supportsDynacast,
  createAudioAnalyser,
} from './room/utils';

import type { AudioAnalyserOptions } from './room/utils';

export * from './options';
export * from './room/errors';
export * from './room/events';
export * from './room/track/create';
export * from './room/track/options';
export * from './room/track/Track';
export * from './room/track/types';
export * from './version';
export * from './e2ee';
export * from './connectionHelper/ConnectionCheck';
export {
  setLogLevel,
  setLogExtension,
  getEmptyAudioStreamTrack,
  getEmptyVideoStreamTrack,
  isBrowserSupported,
  supportsAdaptiveStream,
  supportsDynacast,
  supportsAV1,
  createAudioAnalyser,
  AudioAnalyserOptions,
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
  ParticipantTrackPermission,
  TrackPublication,
  VideoQuality,
  ConnectionQuality,
  ElementInfo,
  DefaultReconnectPolicy,
  CriticalTimers,
};
