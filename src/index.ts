import { DataPacket_Kind, DisconnectReason, SubscriptionError } from '@livekit/protocol';
import { LogLevel, LoggerNames, getLogger, setLogExtension, setLogLevel } from './logger';
import DefaultReconnectPolicy from './room/DefaultReconnectPolicy';
import Room, { ConnectionState } from './room/Room';
import LocalParticipant from './room/participant/LocalParticipant';
import Participant, { ConnectionQuality, ParticipantKind } from './room/participant/Participant';
import type { ParticipantTrackPermission } from './room/participant/ParticipantTrackPermission';
import RemoteParticipant from './room/participant/RemoteParticipant';
import type {
  AudioReceiverStats,
  AudioSenderStats,
  VideoReceiverStats,
  VideoSenderStats,
} from './room/stats';
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
  Mutex,
  createAudioAnalyser,
  getEmptyAudioStreamTrack,
  getEmptyVideoStreamTrack,
  isBrowserSupported,
  supportsAV1,
  supportsAdaptiveStream,
  supportsDynacast,
  supportsVP9,
} from './room/utils';
import { getBrowser } from './utils/browserParser';

export * from './connectionHelper/ConnectionCheck';
export * from './connectionHelper/checks/Checker';
export * from './e2ee';
export * from './options';
export * from './room/errors';
export * from './room/events';
export * from './room/track/Track';
export * from './room/track/create';
export { facingModeFromDeviceLabel, facingModeFromLocalTrack } from './room/track/facingMode';
export * from './room/track/options';
export * from './room/track/processor/types';
export * from './room/track/types';
export type { DataPublishOptions, SimulationScenario, TranscriptionSegment } from './room/types';
export * from './version';
export {
  ConnectionQuality,
  ConnectionState,
  CriticalTimers,
  DataPacket_Kind,
  DefaultReconnectPolicy,
  DisconnectReason,
  LocalAudioTrack,
  LocalParticipant,
  LocalTrack,
  LocalTrackPublication,
  LocalVideoTrack,
  LogLevel,
  LoggerNames,
  Participant,
  RemoteAudioTrack,
  RemoteParticipant,
  ParticipantKind,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteVideoTrack,
  Room,
  SubscriptionError,
  TrackPublication,
  createAudioAnalyser,
  getBrowser,
  getEmptyAudioStreamTrack,
  getEmptyVideoStreamTrack,
  getLogger,
  isBrowserSupported,
  setLogExtension,
  setLogLevel,
  supportsAV1,
  supportsAdaptiveStream,
  supportsDynacast,
  supportsVP9,
  Mutex,
};
export type {
  AudioAnalyserOptions,
  ElementInfo,
  LiveKitReactNativeInfo,
  ParticipantTrackPermission,
  AudioReceiverStats,
  AudioSenderStats,
  VideoReceiverStats,
  VideoSenderStats,
};
