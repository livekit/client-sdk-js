/**
 * The export surface shared by the main entry (`livekit-client`) and the light entry
 * (`livekit-client/core`). The entries add `Room` and `CoreRoom` respectively.
 */
import { Mutex } from '@livekit/mutex';
import {
  DataPacket_Kind,
  DisconnectReason,
  Encryption_Type,
  SubscriptionError,
  TrackType,
} from '@livekit/protocol';
import { LogLevel, LoggerNames, getLogger, setLogExtension, setLogLevel } from './logger';
import { ConnectionState, type RoomEventCallbacks } from './room/CoreRoom';
import DefaultReconnectPolicy from './room/DefaultReconnectPolicy';
import type { ReconnectContext, ReconnectPolicy } from './room/ReconnectPolicy';
import * as attributes from './room/attribute-typings';
import LocalDataTrack from './room/data-track/LocalDataTrack';
import RemoteDataTrack, { type DataTrackSubscribeOptions } from './room/data-track/RemoteDataTrack';
import { type RemoteDataTrackPipelineOptions } from './room/data-track/types';
import { LocalParticipant } from './room/participant/LocalParticipant';
import Participant, {
  ConnectionQuality,
  type ParticipantEventCallbacks,
  ParticipantKind,
} from './room/participant/Participant';
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
import { type PublicationEventCallbacks, TrackPublication } from './room/track/TrackPublication';
import type { LiveKitReactNativeInfo, TextStreamInfo } from './room/types';
import type { AudioAnalyserOptions } from './room/utils';
import {
  compareVersions,
  createAudioAnalyser,
  getEmptyAudioStreamTrack,
  getEmptyVideoStreamTrack,
  isAudioCodec,
  isAudioTrack,
  isBrowserSupported,
  isLocalParticipant,
  isLocalTrack,
  isRemoteParticipant,
  isRemoteTrack,
  isSVCCodec,
  isVideoCodec,
  isVideoTrack,
  supportsAV1,
  supportsAdaptiveStream,
  supportsAudioOutputSelection,
  supportsDynacast,
  supportsH265,
  supportsVP9,
} from './room/utils';
import { getBrowser } from './utils/browserParser';

export { RpcError, type RpcInvocationData, type PerformRpcParams } from './room/rpc';
export type {
  FrameMetadata,
  FrameMetadataPublishOptions,
  /** @deprecated Use {@link FrameMetadata} instead. */
  PacketTrailerMetadata,
  /** @deprecated Use {@link FrameMetadataPublishOptions} instead. */
  PacketTrailerPublishOptions,
} from './frameMetadata/types';
export {
  FrameMetadataManager,
  /** @deprecated Use {@link FrameMetadataManager} instead. */
  PacketTrailerManager,
  type FrameMetadataOptions,
  /** @deprecated Use {@link FrameMetadataOptions} instead. */
  type PacketTrailerOptions,
} from './frameMetadata/FrameMetadataManager';

export * from './connectionHelper/ConnectionCheck';
export * from './connectionHelper/checks/Checker';
export * from './e2ee';
export type { BaseE2EEManager } from './e2ee/E2eeManager';
export * from './options';
export * from './room/errors';
export * from './room/events';
export * from './room/track/Track';
export * from './room/track/create';
export { createLocalScreenTracks, createLocalVideoTrack } from './room/video/create';
export * from './room/token-source/TokenSource';
export * from './room/token-source/types';
export { facingModeFromDeviceLabel, facingModeFromLocalTrack } from './room/track/facingMode';
export * from './room/track/options';
export * from './room/track/processor/types';
export * from './room/track/types';
export type * from './room/data-stream/incoming/StreamReader';
export type * from './room/data-stream/outgoing/StreamWriter';
export type {
  DataPublishOptions,
  SimulationScenario,
  TranscriptionSegment,
  ChatMessage,
  SendTextOptions,
  SendBytesOptions,
  ByteStreamInfo,
} from './room/types';
export * from './version';
export {
  /** @internal */
  attributes,
  ConnectionQuality,
  ConnectionState,
  CriticalTimers,
  DataPacket_Kind,
  Encryption_Type,
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
  SubscriptionError,
  TrackPublication,
  TrackType,
  compareVersions,
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
  supportsAudioOutputSelection,
  supportsDynacast,
  supportsH265,
  supportsVP9,
  Mutex,
  isAudioCodec,
  isAudioTrack,
  isLocalTrack,
  isRemoteTrack,
  isSVCCodec,
  isVideoCodec,
  isVideoTrack,
  isLocalParticipant,
  isRemoteParticipant,
  LocalDataTrack,
  RemoteDataTrack,
};
export type {
  AudioAnalyserOptions,
  ElementInfo,
  LiveKitReactNativeInfo,
  TextStreamInfo,
  ParticipantTrackPermission,
  AudioReceiverStats,
  AudioSenderStats,
  VideoReceiverStats,
  VideoSenderStats,
  ReconnectContext,
  ReconnectPolicy,
  RoomEventCallbacks,
  ParticipantEventCallbacks,
  PublicationEventCallbacks,
  DataTrackSubscribeOptions,
  RemoteDataTrackPipelineOptions,
};
export { type DataTrackFrame } from './room/data-track/frame';
export { DataTrackPacket, type DataTrackPacketHeader } from './room/data-track/packet';
export {
  type DataTrackExtensions,
  type DataTrackUserTimestampExtension,
  type DataTrackE2eeExtension,
} from './room/data-track/packet/extensions';
export { type DataChannelKind } from './room/RTCEngine';
export type { ExtendedRoom, ExtensionResult, RoomClass, RoomExtension } from './room/extensions';
export type { DataStreamLocalApi, DataStreamRoomApi } from './room/data-stream/extension';
export type { RpcLocalApi, RpcRoomApi } from './room/rpc/extension';
export type { DataTrackLocalApi } from './room/data-track/extension';
export type { E2eeRoomApi } from './e2ee/extension';
export type { VideoLocalApi } from './room/video/extension';

export { LocalTrackRecorder } from './room/track/record';
export {
  type Serializer,
  isSerializer,
  type SerializerInput,
  type SerializerOutput,
  serializers,
} from './utils/serializer';
