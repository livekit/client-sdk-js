/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";
import { Timestamp } from "./google/protobuf/timestamp";

export const protobufPackage = "livekit";

export enum TrackType {
  AUDIO = 0,
  VIDEO = 1,
  DATA = 2,
  UNRECOGNIZED = -1,
}

export function trackTypeFromJSON(object: any): TrackType {
  switch (object) {
    case 0:
    case "AUDIO":
      return TrackType.AUDIO;
    case 1:
    case "VIDEO":
      return TrackType.VIDEO;
    case 2:
    case "DATA":
      return TrackType.DATA;
    case -1:
    case "UNRECOGNIZED":
    default:
      return TrackType.UNRECOGNIZED;
  }
}

export function trackTypeToJSON(object: TrackType): string {
  switch (object) {
    case TrackType.AUDIO:
      return "AUDIO";
    case TrackType.VIDEO:
      return "VIDEO";
    case TrackType.DATA:
      return "DATA";
    case TrackType.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export enum TrackSource {
  UNKNOWN = 0,
  CAMERA = 1,
  MICROPHONE = 2,
  SCREEN_SHARE = 3,
  SCREEN_SHARE_AUDIO = 4,
  UNRECOGNIZED = -1,
}

export function trackSourceFromJSON(object: any): TrackSource {
  switch (object) {
    case 0:
    case "UNKNOWN":
      return TrackSource.UNKNOWN;
    case 1:
    case "CAMERA":
      return TrackSource.CAMERA;
    case 2:
    case "MICROPHONE":
      return TrackSource.MICROPHONE;
    case 3:
    case "SCREEN_SHARE":
      return TrackSource.SCREEN_SHARE;
    case 4:
    case "SCREEN_SHARE_AUDIO":
      return TrackSource.SCREEN_SHARE_AUDIO;
    case -1:
    case "UNRECOGNIZED":
    default:
      return TrackSource.UNRECOGNIZED;
  }
}

export function trackSourceToJSON(object: TrackSource): string {
  switch (object) {
    case TrackSource.UNKNOWN:
      return "UNKNOWN";
    case TrackSource.CAMERA:
      return "CAMERA";
    case TrackSource.MICROPHONE:
      return "MICROPHONE";
    case TrackSource.SCREEN_SHARE:
      return "SCREEN_SHARE";
    case TrackSource.SCREEN_SHARE_AUDIO:
      return "SCREEN_SHARE_AUDIO";
    case TrackSource.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export enum VideoQuality {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  OFF = 3,
  UNRECOGNIZED = -1,
}

export function videoQualityFromJSON(object: any): VideoQuality {
  switch (object) {
    case 0:
    case "LOW":
      return VideoQuality.LOW;
    case 1:
    case "MEDIUM":
      return VideoQuality.MEDIUM;
    case 2:
    case "HIGH":
      return VideoQuality.HIGH;
    case 3:
    case "OFF":
      return VideoQuality.OFF;
    case -1:
    case "UNRECOGNIZED":
    default:
      return VideoQuality.UNRECOGNIZED;
  }
}

export function videoQualityToJSON(object: VideoQuality): string {
  switch (object) {
    case VideoQuality.LOW:
      return "LOW";
    case VideoQuality.MEDIUM:
      return "MEDIUM";
    case VideoQuality.HIGH:
      return "HIGH";
    case VideoQuality.OFF:
      return "OFF";
    case VideoQuality.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export enum ConnectionQuality {
  POOR = 0,
  GOOD = 1,
  EXCELLENT = 2,
  UNRECOGNIZED = -1,
}

export function connectionQualityFromJSON(object: any): ConnectionQuality {
  switch (object) {
    case 0:
    case "POOR":
      return ConnectionQuality.POOR;
    case 1:
    case "GOOD":
      return ConnectionQuality.GOOD;
    case 2:
    case "EXCELLENT":
      return ConnectionQuality.EXCELLENT;
    case -1:
    case "UNRECOGNIZED":
    default:
      return ConnectionQuality.UNRECOGNIZED;
  }
}

export function connectionQualityToJSON(object: ConnectionQuality): string {
  switch (object) {
    case ConnectionQuality.POOR:
      return "POOR";
    case ConnectionQuality.GOOD:
      return "GOOD";
    case ConnectionQuality.EXCELLENT:
      return "EXCELLENT";
    case ConnectionQuality.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export enum ClientConfigSetting {
  UNSET = 0,
  DISABLED = 1,
  ENABLED = 2,
  UNRECOGNIZED = -1,
}

export function clientConfigSettingFromJSON(object: any): ClientConfigSetting {
  switch (object) {
    case 0:
    case "UNSET":
      return ClientConfigSetting.UNSET;
    case 1:
    case "DISABLED":
      return ClientConfigSetting.DISABLED;
    case 2:
    case "ENABLED":
      return ClientConfigSetting.ENABLED;
    case -1:
    case "UNRECOGNIZED":
    default:
      return ClientConfigSetting.UNRECOGNIZED;
  }
}

export function clientConfigSettingToJSON(object: ClientConfigSetting): string {
  switch (object) {
    case ClientConfigSetting.UNSET:
      return "UNSET";
    case ClientConfigSetting.DISABLED:
      return "DISABLED";
    case ClientConfigSetting.ENABLED:
      return "ENABLED";
    case ClientConfigSetting.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export enum DisconnectReason {
  UNKNOWN_REASON = 0,
  CLIENT_INITIATED = 1,
  DUPLICATE_IDENTITY = 2,
  SERVER_SHUTDOWN = 3,
  PARTICIPANT_REMOVED = 4,
  ROOM_DELETED = 5,
  STATE_MISMATCH = 6,
  JOIN_FAILURE = 7,
  UNRECOGNIZED = -1,
}

export function disconnectReasonFromJSON(object: any): DisconnectReason {
  switch (object) {
    case 0:
    case "UNKNOWN_REASON":
      return DisconnectReason.UNKNOWN_REASON;
    case 1:
    case "CLIENT_INITIATED":
      return DisconnectReason.CLIENT_INITIATED;
    case 2:
    case "DUPLICATE_IDENTITY":
      return DisconnectReason.DUPLICATE_IDENTITY;
    case 3:
    case "SERVER_SHUTDOWN":
      return DisconnectReason.SERVER_SHUTDOWN;
    case 4:
    case "PARTICIPANT_REMOVED":
      return DisconnectReason.PARTICIPANT_REMOVED;
    case 5:
    case "ROOM_DELETED":
      return DisconnectReason.ROOM_DELETED;
    case 6:
    case "STATE_MISMATCH":
      return DisconnectReason.STATE_MISMATCH;
    case 7:
    case "JOIN_FAILURE":
      return DisconnectReason.JOIN_FAILURE;
    case -1:
    case "UNRECOGNIZED":
    default:
      return DisconnectReason.UNRECOGNIZED;
  }
}

export function disconnectReasonToJSON(object: DisconnectReason): string {
  switch (object) {
    case DisconnectReason.UNKNOWN_REASON:
      return "UNKNOWN_REASON";
    case DisconnectReason.CLIENT_INITIATED:
      return "CLIENT_INITIATED";
    case DisconnectReason.DUPLICATE_IDENTITY:
      return "DUPLICATE_IDENTITY";
    case DisconnectReason.SERVER_SHUTDOWN:
      return "SERVER_SHUTDOWN";
    case DisconnectReason.PARTICIPANT_REMOVED:
      return "PARTICIPANT_REMOVED";
    case DisconnectReason.ROOM_DELETED:
      return "ROOM_DELETED";
    case DisconnectReason.STATE_MISMATCH:
      return "STATE_MISMATCH";
    case DisconnectReason.JOIN_FAILURE:
      return "JOIN_FAILURE";
    case DisconnectReason.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export enum ReconnectReason {
  REASON_UNKOWN = 0,
  REASON_SIGNAL_DISCONNECTED = 1,
  REASON_PUBLISHER_FAILED = 2,
  REASON_SUBSCRIBER_FAILED = 3,
  REASON_SWITCH_CANDIDATE = 4,
  UNRECOGNIZED = -1,
}

export function reconnectReasonFromJSON(object: any): ReconnectReason {
  switch (object) {
    case 0:
    case "REASON_UNKOWN":
      return ReconnectReason.REASON_UNKOWN;
    case 1:
    case "REASON_SIGNAL_DISCONNECTED":
      return ReconnectReason.REASON_SIGNAL_DISCONNECTED;
    case 2:
    case "REASON_PUBLISHER_FAILED":
      return ReconnectReason.REASON_PUBLISHER_FAILED;
    case 3:
    case "REASON_SUBSCRIBER_FAILED":
      return ReconnectReason.REASON_SUBSCRIBER_FAILED;
    case 4:
    case "REASON_SWITCH_CANDIDATE":
      return ReconnectReason.REASON_SWITCH_CANDIDATE;
    case -1:
    case "UNRECOGNIZED":
    default:
      return ReconnectReason.UNRECOGNIZED;
  }
}

export function reconnectReasonToJSON(object: ReconnectReason): string {
  switch (object) {
    case ReconnectReason.REASON_UNKOWN:
      return "REASON_UNKOWN";
    case ReconnectReason.REASON_SIGNAL_DISCONNECTED:
      return "REASON_SIGNAL_DISCONNECTED";
    case ReconnectReason.REASON_PUBLISHER_FAILED:
      return "REASON_PUBLISHER_FAILED";
    case ReconnectReason.REASON_SUBSCRIBER_FAILED:
      return "REASON_SUBSCRIBER_FAILED";
    case ReconnectReason.REASON_SWITCH_CANDIDATE:
      return "REASON_SWITCH_CANDIDATE";
    case ReconnectReason.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export interface Room {
  sid: string;
  name: string;
  emptyTimeout: number;
  maxParticipants: number;
  creationTime: number;
  turnPassword: string;
  enabledCodecs: Codec[];
  metadata: string;
  numParticipants: number;
  activeRecording: boolean;
}

export interface Codec {
  mime: string;
  fmtpLine: string;
}

export interface ParticipantPermission {
  /** allow participant to subscribe to other tracks in the room */
  canSubscribe: boolean;
  /** allow participant to publish new tracks to room */
  canPublish: boolean;
  /** allow participant to publish data */
  canPublishData: boolean;
  /** sources that are allowed to be published */
  canPublishSources: TrackSource[];
  /** indicates that it's hidden to others */
  hidden: boolean;
  /** indicates it's a recorder instance */
  recorder: boolean;
}

export interface ParticipantInfo {
  sid: string;
  identity: string;
  state: ParticipantInfo_State;
  tracks: TrackInfo[];
  metadata: string;
  /** timestamp when participant joined room, in seconds */
  joinedAt: number;
  name: string;
  version: number;
  permission?: ParticipantPermission;
  region: string;
  /**
   * indicates the participant has an active publisher connection
   * and can publish to the server
   */
  isPublisher: boolean;
}

export enum ParticipantInfo_State {
  /** JOINING - websocket' connected, but not offered yet */
  JOINING = 0,
  /** JOINED - server received client offer */
  JOINED = 1,
  /** ACTIVE - ICE connectivity established */
  ACTIVE = 2,
  /** DISCONNECTED - WS disconnected */
  DISCONNECTED = 3,
  UNRECOGNIZED = -1,
}

export function participantInfo_StateFromJSON(object: any): ParticipantInfo_State {
  switch (object) {
    case 0:
    case "JOINING":
      return ParticipantInfo_State.JOINING;
    case 1:
    case "JOINED":
      return ParticipantInfo_State.JOINED;
    case 2:
    case "ACTIVE":
      return ParticipantInfo_State.ACTIVE;
    case 3:
    case "DISCONNECTED":
      return ParticipantInfo_State.DISCONNECTED;
    case -1:
    case "UNRECOGNIZED":
    default:
      return ParticipantInfo_State.UNRECOGNIZED;
  }
}

export function participantInfo_StateToJSON(object: ParticipantInfo_State): string {
  switch (object) {
    case ParticipantInfo_State.JOINING:
      return "JOINING";
    case ParticipantInfo_State.JOINED:
      return "JOINED";
    case ParticipantInfo_State.ACTIVE:
      return "ACTIVE";
    case ParticipantInfo_State.DISCONNECTED:
      return "DISCONNECTED";
    case ParticipantInfo_State.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export interface Encryption {
}

export enum Encryption_Type {
  NONE = 0,
  GCM = 1,
  CUSTOM = 2,
  UNRECOGNIZED = -1,
}

export function encryption_TypeFromJSON(object: any): Encryption_Type {
  switch (object) {
    case 0:
    case "NONE":
      return Encryption_Type.NONE;
    case 1:
    case "GCM":
      return Encryption_Type.GCM;
    case 2:
    case "CUSTOM":
      return Encryption_Type.CUSTOM;
    case -1:
    case "UNRECOGNIZED":
    default:
      return Encryption_Type.UNRECOGNIZED;
  }
}

export function encryption_TypeToJSON(object: Encryption_Type): string {
  switch (object) {
    case Encryption_Type.NONE:
      return "NONE";
    case Encryption_Type.GCM:
      return "GCM";
    case Encryption_Type.CUSTOM:
      return "CUSTOM";
    case Encryption_Type.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export interface SimulcastCodecInfo {
  mimeType: string;
  mid: string;
  cid: string;
  layers: VideoLayer[];
}

export interface TrackInfo {
  sid: string;
  type: TrackType;
  name: string;
  muted: boolean;
  /**
   * original width of video (unset for audio)
   * clients may receive a lower resolution version with simulcast
   */
  width: number;
  /** original height of video (unset for audio) */
  height: number;
  /** true if track is simulcasted */
  simulcast: boolean;
  /** true if DTX (Discontinuous Transmission) is disabled for audio */
  disableDtx: boolean;
  /** source of media */
  source: TrackSource;
  layers: VideoLayer[];
  /** mime type of codec */
  mimeType: string;
  mid: string;
  codecs: SimulcastCodecInfo[];
  stereo: boolean;
  /** true if RED (Redundant Encoding) is disabled for audio */
  disableRed: boolean;
  encryption: Encryption_Type;
}

/** provide information about available spatial layers */
export interface VideoLayer {
  /** for tracks with a single layer, this should be HIGH */
  quality: VideoQuality;
  width: number;
  height: number;
  /** target bitrate in bit per second (bps), server will measure actual */
  bitrate: number;
  ssrc: number;
}

/** new DataPacket API */
export interface DataPacket {
  kind: DataPacket_Kind;
  value?: { $case: "user"; user: UserPacket } | { $case: "speaker"; speaker: ActiveSpeakerUpdate };
}

export enum DataPacket_Kind {
  RELIABLE = 0,
  LOSSY = 1,
  UNRECOGNIZED = -1,
}

export function dataPacket_KindFromJSON(object: any): DataPacket_Kind {
  switch (object) {
    case 0:
    case "RELIABLE":
      return DataPacket_Kind.RELIABLE;
    case 1:
    case "LOSSY":
      return DataPacket_Kind.LOSSY;
    case -1:
    case "UNRECOGNIZED":
    default:
      return DataPacket_Kind.UNRECOGNIZED;
  }
}

export function dataPacket_KindToJSON(object: DataPacket_Kind): string {
  switch (object) {
    case DataPacket_Kind.RELIABLE:
      return "RELIABLE";
    case DataPacket_Kind.LOSSY:
      return "LOSSY";
    case DataPacket_Kind.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

export interface ActiveSpeakerUpdate {
  speakers: SpeakerInfo[];
}

export interface SpeakerInfo {
  sid: string;
  /** audio level, 0-1.0, 1 is loudest */
  level: number;
  /** true if speaker is currently active */
  active: boolean;
}

export interface UserPacket {
  /** participant ID of user that sent the message */
  participantSid: string;
  /** user defined payload */
  payload: Uint8Array;
  /** the ID of the participants who will receive the message (the message will be sent to all the people in the room if this variable is empty) */
  destinationSids: string[];
}

export interface ParticipantTracks {
  /** participant ID of participant to whom the tracks belong */
  participantSid: string;
  trackSids: string[];
}

/** details about the server */
export interface ServerInfo {
  edition: ServerInfo_Edition;
  version: string;
  protocol: number;
  region: string;
  nodeId: string;
  /** additional debugging information. sent only if server is in development mode */
  debugInfo: string;
}

export enum ServerInfo_Edition {
  Standard = 0,
  Cloud = 1,
  UNRECOGNIZED = -1,
}

export function serverInfo_EditionFromJSON(object: any): ServerInfo_Edition {
  switch (object) {
    case 0:
    case "Standard":
      return ServerInfo_Edition.Standard;
    case 1:
    case "Cloud":
      return ServerInfo_Edition.Cloud;
    case -1:
    case "UNRECOGNIZED":
    default:
      return ServerInfo_Edition.UNRECOGNIZED;
  }
}

export function serverInfo_EditionToJSON(object: ServerInfo_Edition): string {
  switch (object) {
    case ServerInfo_Edition.Standard:
      return "Standard";
    case ServerInfo_Edition.Cloud:
      return "Cloud";
    case ServerInfo_Edition.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

/** details about the client */
export interface ClientInfo {
  sdk: ClientInfo_SDK;
  version: string;
  protocol: number;
  os: string;
  osVersion: string;
  deviceModel: string;
  browser: string;
  browserVersion: string;
  address: string;
  /** wifi, wired, cellular, vpn, empty if not known */
  network: string;
}

export enum ClientInfo_SDK {
  UNKNOWN = 0,
  JS = 1,
  SWIFT = 2,
  ANDROID = 3,
  FLUTTER = 4,
  GO = 5,
  UNITY = 6,
  UNRECOGNIZED = -1,
}

export function clientInfo_SDKFromJSON(object: any): ClientInfo_SDK {
  switch (object) {
    case 0:
    case "UNKNOWN":
      return ClientInfo_SDK.UNKNOWN;
    case 1:
    case "JS":
      return ClientInfo_SDK.JS;
    case 2:
    case "SWIFT":
      return ClientInfo_SDK.SWIFT;
    case 3:
    case "ANDROID":
      return ClientInfo_SDK.ANDROID;
    case 4:
    case "FLUTTER":
      return ClientInfo_SDK.FLUTTER;
    case 5:
    case "GO":
      return ClientInfo_SDK.GO;
    case 6:
    case "UNITY":
      return ClientInfo_SDK.UNITY;
    case -1:
    case "UNRECOGNIZED":
    default:
      return ClientInfo_SDK.UNRECOGNIZED;
  }
}

export function clientInfo_SDKToJSON(object: ClientInfo_SDK): string {
  switch (object) {
    case ClientInfo_SDK.UNKNOWN:
      return "UNKNOWN";
    case ClientInfo_SDK.JS:
      return "JS";
    case ClientInfo_SDK.SWIFT:
      return "SWIFT";
    case ClientInfo_SDK.ANDROID:
      return "ANDROID";
    case ClientInfo_SDK.FLUTTER:
      return "FLUTTER";
    case ClientInfo_SDK.GO:
      return "GO";
    case ClientInfo_SDK.UNITY:
      return "UNITY";
    case ClientInfo_SDK.UNRECOGNIZED:
    default:
      return "UNRECOGNIZED";
  }
}

/** server provided client configuration */
export interface ClientConfiguration {
  video?: VideoConfiguration;
  screen?: VideoConfiguration;
  resumeConnection: ClientConfigSetting;
  disabledCodecs?: DisabledCodecs;
  forceRelay: ClientConfigSetting;
}

export interface VideoConfiguration {
  hardwareEncoder: ClientConfigSetting;
}

export interface DisabledCodecs {
  codecs: Codec[];
}

export interface RTPStats {
  startTime?: Date;
  endTime?: Date;
  duration: number;
  packets: number;
  packetRate: number;
  bytes: number;
  headerBytes: number;
  bitrate: number;
  packetsLost: number;
  packetLossRate: number;
  packetLossPercentage: number;
  packetsDuplicate: number;
  packetDuplicateRate: number;
  bytesDuplicate: number;
  headerBytesDuplicate: number;
  bitrateDuplicate: number;
  packetsPadding: number;
  packetPaddingRate: number;
  bytesPadding: number;
  headerBytesPadding: number;
  bitratePadding: number;
  packetsOutOfOrder: number;
  frames: number;
  frameRate: number;
  jitterCurrent: number;
  jitterMax: number;
  gapHistogram: { [key: number]: number };
  nacks: number;
  nackAcks: number;
  nackMisses: number;
  nackRepeated: number;
  plis: number;
  lastPli?: Date;
  firs: number;
  lastFir?: Date;
  rttCurrent: number;
  rttMax: number;
  keyFrames: number;
  lastKeyFrame?: Date;
  layerLockPlis: number;
  lastLayerLockPli?: Date;
}

export interface RTPStats_GapHistogramEntry {
  key: number;
  value: number;
}

export interface TimedVersion {
  unixMicro: number;
  ticks: number;
}

function createBaseRoom(): Room {
  return {
    sid: "",
    name: "",
    emptyTimeout: 0,
    maxParticipants: 0,
    creationTime: 0,
    turnPassword: "",
    enabledCodecs: [],
    metadata: "",
    numParticipants: 0,
    activeRecording: false,
  };
}

export const Room = {
  encode(message: Room, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.sid !== "") {
      writer.uint32(10).string(message.sid);
    }
    if (message.name !== "") {
      writer.uint32(18).string(message.name);
    }
    if (message.emptyTimeout !== 0) {
      writer.uint32(24).uint32(message.emptyTimeout);
    }
    if (message.maxParticipants !== 0) {
      writer.uint32(32).uint32(message.maxParticipants);
    }
    if (message.creationTime !== 0) {
      writer.uint32(40).int64(message.creationTime);
    }
    if (message.turnPassword !== "") {
      writer.uint32(50).string(message.turnPassword);
    }
    for (const v of message.enabledCodecs) {
      Codec.encode(v!, writer.uint32(58).fork()).ldelim();
    }
    if (message.metadata !== "") {
      writer.uint32(66).string(message.metadata);
    }
    if (message.numParticipants !== 0) {
      writer.uint32(72).uint32(message.numParticipants);
    }
    if (message.activeRecording === true) {
      writer.uint32(80).bool(message.activeRecording);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Room {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRoom();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sid = reader.string();
          break;
        case 2:
          message.name = reader.string();
          break;
        case 3:
          message.emptyTimeout = reader.uint32();
          break;
        case 4:
          message.maxParticipants = reader.uint32();
          break;
        case 5:
          message.creationTime = longToNumber(reader.int64() as Long);
          break;
        case 6:
          message.turnPassword = reader.string();
          break;
        case 7:
          message.enabledCodecs.push(Codec.decode(reader, reader.uint32()));
          break;
        case 8:
          message.metadata = reader.string();
          break;
        case 9:
          message.numParticipants = reader.uint32();
          break;
        case 10:
          message.activeRecording = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): Room {
    return {
      sid: isSet(object.sid) ? String(object.sid) : "",
      name: isSet(object.name) ? String(object.name) : "",
      emptyTimeout: isSet(object.emptyTimeout) ? Number(object.emptyTimeout) : 0,
      maxParticipants: isSet(object.maxParticipants) ? Number(object.maxParticipants) : 0,
      creationTime: isSet(object.creationTime) ? Number(object.creationTime) : 0,
      turnPassword: isSet(object.turnPassword) ? String(object.turnPassword) : "",
      enabledCodecs: Array.isArray(object?.enabledCodecs)
        ? object.enabledCodecs.map((e: any) => Codec.fromJSON(e))
        : [],
      metadata: isSet(object.metadata) ? String(object.metadata) : "",
      numParticipants: isSet(object.numParticipants) ? Number(object.numParticipants) : 0,
      activeRecording: isSet(object.activeRecording) ? Boolean(object.activeRecording) : false,
    };
  },

  toJSON(message: Room): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.name !== undefined && (obj.name = message.name);
    message.emptyTimeout !== undefined && (obj.emptyTimeout = Math.round(message.emptyTimeout));
    message.maxParticipants !== undefined && (obj.maxParticipants = Math.round(message.maxParticipants));
    message.creationTime !== undefined && (obj.creationTime = Math.round(message.creationTime));
    message.turnPassword !== undefined && (obj.turnPassword = message.turnPassword);
    if (message.enabledCodecs) {
      obj.enabledCodecs = message.enabledCodecs.map((e) => e ? Codec.toJSON(e) : undefined);
    } else {
      obj.enabledCodecs = [];
    }
    message.metadata !== undefined && (obj.metadata = message.metadata);
    message.numParticipants !== undefined && (obj.numParticipants = Math.round(message.numParticipants));
    message.activeRecording !== undefined && (obj.activeRecording = message.activeRecording);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<Room>, I>>(object: I): Room {
    const message = createBaseRoom();
    message.sid = object.sid ?? "";
    message.name = object.name ?? "";
    message.emptyTimeout = object.emptyTimeout ?? 0;
    message.maxParticipants = object.maxParticipants ?? 0;
    message.creationTime = object.creationTime ?? 0;
    message.turnPassword = object.turnPassword ?? "";
    message.enabledCodecs = object.enabledCodecs?.map((e) => Codec.fromPartial(e)) || [];
    message.metadata = object.metadata ?? "";
    message.numParticipants = object.numParticipants ?? 0;
    message.activeRecording = object.activeRecording ?? false;
    return message;
  },
};

function createBaseCodec(): Codec {
  return { mime: "", fmtpLine: "" };
}

export const Codec = {
  encode(message: Codec, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.mime !== "") {
      writer.uint32(10).string(message.mime);
    }
    if (message.fmtpLine !== "") {
      writer.uint32(18).string(message.fmtpLine);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Codec {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseCodec();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.mime = reader.string();
          break;
        case 2:
          message.fmtpLine = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): Codec {
    return {
      mime: isSet(object.mime) ? String(object.mime) : "",
      fmtpLine: isSet(object.fmtpLine) ? String(object.fmtpLine) : "",
    };
  },

  toJSON(message: Codec): unknown {
    const obj: any = {};
    message.mime !== undefined && (obj.mime = message.mime);
    message.fmtpLine !== undefined && (obj.fmtpLine = message.fmtpLine);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<Codec>, I>>(object: I): Codec {
    const message = createBaseCodec();
    message.mime = object.mime ?? "";
    message.fmtpLine = object.fmtpLine ?? "";
    return message;
  },
};

function createBaseParticipantPermission(): ParticipantPermission {
  return {
    canSubscribe: false,
    canPublish: false,
    canPublishData: false,
    canPublishSources: [],
    hidden: false,
    recorder: false,
  };
}

export const ParticipantPermission = {
  encode(message: ParticipantPermission, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.canSubscribe === true) {
      writer.uint32(8).bool(message.canSubscribe);
    }
    if (message.canPublish === true) {
      writer.uint32(16).bool(message.canPublish);
    }
    if (message.canPublishData === true) {
      writer.uint32(24).bool(message.canPublishData);
    }
    writer.uint32(74).fork();
    for (const v of message.canPublishSources) {
      writer.int32(v);
    }
    writer.ldelim();
    if (message.hidden === true) {
      writer.uint32(56).bool(message.hidden);
    }
    if (message.recorder === true) {
      writer.uint32(64).bool(message.recorder);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ParticipantPermission {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseParticipantPermission();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.canSubscribe = reader.bool();
          break;
        case 2:
          message.canPublish = reader.bool();
          break;
        case 3:
          message.canPublishData = reader.bool();
          break;
        case 9:
          if ((tag & 7) === 2) {
            const end2 = reader.uint32() + reader.pos;
            while (reader.pos < end2) {
              message.canPublishSources.push(reader.int32() as any);
            }
          } else {
            message.canPublishSources.push(reader.int32() as any);
          }
          break;
        case 7:
          message.hidden = reader.bool();
          break;
        case 8:
          message.recorder = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ParticipantPermission {
    return {
      canSubscribe: isSet(object.canSubscribe) ? Boolean(object.canSubscribe) : false,
      canPublish: isSet(object.canPublish) ? Boolean(object.canPublish) : false,
      canPublishData: isSet(object.canPublishData) ? Boolean(object.canPublishData) : false,
      canPublishSources: Array.isArray(object?.canPublishSources)
        ? object.canPublishSources.map((e: any) => trackSourceFromJSON(e))
        : [],
      hidden: isSet(object.hidden) ? Boolean(object.hidden) : false,
      recorder: isSet(object.recorder) ? Boolean(object.recorder) : false,
    };
  },

  toJSON(message: ParticipantPermission): unknown {
    const obj: any = {};
    message.canSubscribe !== undefined && (obj.canSubscribe = message.canSubscribe);
    message.canPublish !== undefined && (obj.canPublish = message.canPublish);
    message.canPublishData !== undefined && (obj.canPublishData = message.canPublishData);
    if (message.canPublishSources) {
      obj.canPublishSources = message.canPublishSources.map((e) => trackSourceToJSON(e));
    } else {
      obj.canPublishSources = [];
    }
    message.hidden !== undefined && (obj.hidden = message.hidden);
    message.recorder !== undefined && (obj.recorder = message.recorder);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ParticipantPermission>, I>>(object: I): ParticipantPermission {
    const message = createBaseParticipantPermission();
    message.canSubscribe = object.canSubscribe ?? false;
    message.canPublish = object.canPublish ?? false;
    message.canPublishData = object.canPublishData ?? false;
    message.canPublishSources = object.canPublishSources?.map((e) => e) || [];
    message.hidden = object.hidden ?? false;
    message.recorder = object.recorder ?? false;
    return message;
  },
};

function createBaseParticipantInfo(): ParticipantInfo {
  return {
    sid: "",
    identity: "",
    state: 0,
    tracks: [],
    metadata: "",
    joinedAt: 0,
    name: "",
    version: 0,
    permission: undefined,
    region: "",
    isPublisher: false,
  };
}

export const ParticipantInfo = {
  encode(message: ParticipantInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.sid !== "") {
      writer.uint32(10).string(message.sid);
    }
    if (message.identity !== "") {
      writer.uint32(18).string(message.identity);
    }
    if (message.state !== 0) {
      writer.uint32(24).int32(message.state);
    }
    for (const v of message.tracks) {
      TrackInfo.encode(v!, writer.uint32(34).fork()).ldelim();
    }
    if (message.metadata !== "") {
      writer.uint32(42).string(message.metadata);
    }
    if (message.joinedAt !== 0) {
      writer.uint32(48).int64(message.joinedAt);
    }
    if (message.name !== "") {
      writer.uint32(74).string(message.name);
    }
    if (message.version !== 0) {
      writer.uint32(80).uint32(message.version);
    }
    if (message.permission !== undefined) {
      ParticipantPermission.encode(message.permission, writer.uint32(90).fork()).ldelim();
    }
    if (message.region !== "") {
      writer.uint32(98).string(message.region);
    }
    if (message.isPublisher === true) {
      writer.uint32(104).bool(message.isPublisher);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ParticipantInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseParticipantInfo();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sid = reader.string();
          break;
        case 2:
          message.identity = reader.string();
          break;
        case 3:
          message.state = reader.int32() as any;
          break;
        case 4:
          message.tracks.push(TrackInfo.decode(reader, reader.uint32()));
          break;
        case 5:
          message.metadata = reader.string();
          break;
        case 6:
          message.joinedAt = longToNumber(reader.int64() as Long);
          break;
        case 9:
          message.name = reader.string();
          break;
        case 10:
          message.version = reader.uint32();
          break;
        case 11:
          message.permission = ParticipantPermission.decode(reader, reader.uint32());
          break;
        case 12:
          message.region = reader.string();
          break;
        case 13:
          message.isPublisher = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ParticipantInfo {
    return {
      sid: isSet(object.sid) ? String(object.sid) : "",
      identity: isSet(object.identity) ? String(object.identity) : "",
      state: isSet(object.state) ? participantInfo_StateFromJSON(object.state) : 0,
      tracks: Array.isArray(object?.tracks) ? object.tracks.map((e: any) => TrackInfo.fromJSON(e)) : [],
      metadata: isSet(object.metadata) ? String(object.metadata) : "",
      joinedAt: isSet(object.joinedAt) ? Number(object.joinedAt) : 0,
      name: isSet(object.name) ? String(object.name) : "",
      version: isSet(object.version) ? Number(object.version) : 0,
      permission: isSet(object.permission) ? ParticipantPermission.fromJSON(object.permission) : undefined,
      region: isSet(object.region) ? String(object.region) : "",
      isPublisher: isSet(object.isPublisher) ? Boolean(object.isPublisher) : false,
    };
  },

  toJSON(message: ParticipantInfo): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.identity !== undefined && (obj.identity = message.identity);
    message.state !== undefined && (obj.state = participantInfo_StateToJSON(message.state));
    if (message.tracks) {
      obj.tracks = message.tracks.map((e) => e ? TrackInfo.toJSON(e) : undefined);
    } else {
      obj.tracks = [];
    }
    message.metadata !== undefined && (obj.metadata = message.metadata);
    message.joinedAt !== undefined && (obj.joinedAt = Math.round(message.joinedAt));
    message.name !== undefined && (obj.name = message.name);
    message.version !== undefined && (obj.version = Math.round(message.version));
    message.permission !== undefined &&
      (obj.permission = message.permission ? ParticipantPermission.toJSON(message.permission) : undefined);
    message.region !== undefined && (obj.region = message.region);
    message.isPublisher !== undefined && (obj.isPublisher = message.isPublisher);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ParticipantInfo>, I>>(object: I): ParticipantInfo {
    const message = createBaseParticipantInfo();
    message.sid = object.sid ?? "";
    message.identity = object.identity ?? "";
    message.state = object.state ?? 0;
    message.tracks = object.tracks?.map((e) => TrackInfo.fromPartial(e)) || [];
    message.metadata = object.metadata ?? "";
    message.joinedAt = object.joinedAt ?? 0;
    message.name = object.name ?? "";
    message.version = object.version ?? 0;
    message.permission = (object.permission !== undefined && object.permission !== null)
      ? ParticipantPermission.fromPartial(object.permission)
      : undefined;
    message.region = object.region ?? "";
    message.isPublisher = object.isPublisher ?? false;
    return message;
  },
};

function createBaseEncryption(): Encryption {
  return {};
}

export const Encryption = {
  encode(_: Encryption, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Encryption {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseEncryption();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(_: any): Encryption {
    return {};
  },

  toJSON(_: Encryption): unknown {
    const obj: any = {};
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<Encryption>, I>>(_: I): Encryption {
    const message = createBaseEncryption();
    return message;
  },
};

function createBaseSimulcastCodecInfo(): SimulcastCodecInfo {
  return { mimeType: "", mid: "", cid: "", layers: [] };
}

export const SimulcastCodecInfo = {
  encode(message: SimulcastCodecInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.mimeType !== "") {
      writer.uint32(10).string(message.mimeType);
    }
    if (message.mid !== "") {
      writer.uint32(18).string(message.mid);
    }
    if (message.cid !== "") {
      writer.uint32(26).string(message.cid);
    }
    for (const v of message.layers) {
      VideoLayer.encode(v!, writer.uint32(34).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SimulcastCodecInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseSimulcastCodecInfo();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.mimeType = reader.string();
          break;
        case 2:
          message.mid = reader.string();
          break;
        case 3:
          message.cid = reader.string();
          break;
        case 4:
          message.layers.push(VideoLayer.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SimulcastCodecInfo {
    return {
      mimeType: isSet(object.mimeType) ? String(object.mimeType) : "",
      mid: isSet(object.mid) ? String(object.mid) : "",
      cid: isSet(object.cid) ? String(object.cid) : "",
      layers: Array.isArray(object?.layers) ? object.layers.map((e: any) => VideoLayer.fromJSON(e)) : [],
    };
  },

  toJSON(message: SimulcastCodecInfo): unknown {
    const obj: any = {};
    message.mimeType !== undefined && (obj.mimeType = message.mimeType);
    message.mid !== undefined && (obj.mid = message.mid);
    message.cid !== undefined && (obj.cid = message.cid);
    if (message.layers) {
      obj.layers = message.layers.map((e) => e ? VideoLayer.toJSON(e) : undefined);
    } else {
      obj.layers = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SimulcastCodecInfo>, I>>(object: I): SimulcastCodecInfo {
    const message = createBaseSimulcastCodecInfo();
    message.mimeType = object.mimeType ?? "";
    message.mid = object.mid ?? "";
    message.cid = object.cid ?? "";
    message.layers = object.layers?.map((e) => VideoLayer.fromPartial(e)) || [];
    return message;
  },
};

function createBaseTrackInfo(): TrackInfo {
  return {
    sid: "",
    type: 0,
    name: "",
    muted: false,
    width: 0,
    height: 0,
    simulcast: false,
    disableDtx: false,
    source: 0,
    layers: [],
    mimeType: "",
    mid: "",
    codecs: [],
    stereo: false,
    disableRed: false,
    encryption: 0,
  };
}

export const TrackInfo = {
  encode(message: TrackInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.sid !== "") {
      writer.uint32(10).string(message.sid);
    }
    if (message.type !== 0) {
      writer.uint32(16).int32(message.type);
    }
    if (message.name !== "") {
      writer.uint32(26).string(message.name);
    }
    if (message.muted === true) {
      writer.uint32(32).bool(message.muted);
    }
    if (message.width !== 0) {
      writer.uint32(40).uint32(message.width);
    }
    if (message.height !== 0) {
      writer.uint32(48).uint32(message.height);
    }
    if (message.simulcast === true) {
      writer.uint32(56).bool(message.simulcast);
    }
    if (message.disableDtx === true) {
      writer.uint32(64).bool(message.disableDtx);
    }
    if (message.source !== 0) {
      writer.uint32(72).int32(message.source);
    }
    for (const v of message.layers) {
      VideoLayer.encode(v!, writer.uint32(82).fork()).ldelim();
    }
    if (message.mimeType !== "") {
      writer.uint32(90).string(message.mimeType);
    }
    if (message.mid !== "") {
      writer.uint32(98).string(message.mid);
    }
    for (const v of message.codecs) {
      SimulcastCodecInfo.encode(v!, writer.uint32(106).fork()).ldelim();
    }
    if (message.stereo === true) {
      writer.uint32(112).bool(message.stereo);
    }
    if (message.disableRed === true) {
      writer.uint32(120).bool(message.disableRed);
    }
    if (message.encryption !== 0) {
      writer.uint32(128).int32(message.encryption);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TrackInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseTrackInfo();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sid = reader.string();
          break;
        case 2:
          message.type = reader.int32() as any;
          break;
        case 3:
          message.name = reader.string();
          break;
        case 4:
          message.muted = reader.bool();
          break;
        case 5:
          message.width = reader.uint32();
          break;
        case 6:
          message.height = reader.uint32();
          break;
        case 7:
          message.simulcast = reader.bool();
          break;
        case 8:
          message.disableDtx = reader.bool();
          break;
        case 9:
          message.source = reader.int32() as any;
          break;
        case 10:
          message.layers.push(VideoLayer.decode(reader, reader.uint32()));
          break;
        case 11:
          message.mimeType = reader.string();
          break;
        case 12:
          message.mid = reader.string();
          break;
        case 13:
          message.codecs.push(SimulcastCodecInfo.decode(reader, reader.uint32()));
          break;
        case 14:
          message.stereo = reader.bool();
          break;
        case 15:
          message.disableRed = reader.bool();
          break;
        case 16:
          message.encryption = reader.int32() as any;
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): TrackInfo {
    return {
      sid: isSet(object.sid) ? String(object.sid) : "",
      type: isSet(object.type) ? trackTypeFromJSON(object.type) : 0,
      name: isSet(object.name) ? String(object.name) : "",
      muted: isSet(object.muted) ? Boolean(object.muted) : false,
      width: isSet(object.width) ? Number(object.width) : 0,
      height: isSet(object.height) ? Number(object.height) : 0,
      simulcast: isSet(object.simulcast) ? Boolean(object.simulcast) : false,
      disableDtx: isSet(object.disableDtx) ? Boolean(object.disableDtx) : false,
      source: isSet(object.source) ? trackSourceFromJSON(object.source) : 0,
      layers: Array.isArray(object?.layers) ? object.layers.map((e: any) => VideoLayer.fromJSON(e)) : [],
      mimeType: isSet(object.mimeType) ? String(object.mimeType) : "",
      mid: isSet(object.mid) ? String(object.mid) : "",
      codecs: Array.isArray(object?.codecs) ? object.codecs.map((e: any) => SimulcastCodecInfo.fromJSON(e)) : [],
      stereo: isSet(object.stereo) ? Boolean(object.stereo) : false,
      disableRed: isSet(object.disableRed) ? Boolean(object.disableRed) : false,
      encryption: isSet(object.encryption) ? encryption_TypeFromJSON(object.encryption) : 0,
    };
  },

  toJSON(message: TrackInfo): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.type !== undefined && (obj.type = trackTypeToJSON(message.type));
    message.name !== undefined && (obj.name = message.name);
    message.muted !== undefined && (obj.muted = message.muted);
    message.width !== undefined && (obj.width = Math.round(message.width));
    message.height !== undefined && (obj.height = Math.round(message.height));
    message.simulcast !== undefined && (obj.simulcast = message.simulcast);
    message.disableDtx !== undefined && (obj.disableDtx = message.disableDtx);
    message.source !== undefined && (obj.source = trackSourceToJSON(message.source));
    if (message.layers) {
      obj.layers = message.layers.map((e) => e ? VideoLayer.toJSON(e) : undefined);
    } else {
      obj.layers = [];
    }
    message.mimeType !== undefined && (obj.mimeType = message.mimeType);
    message.mid !== undefined && (obj.mid = message.mid);
    if (message.codecs) {
      obj.codecs = message.codecs.map((e) => e ? SimulcastCodecInfo.toJSON(e) : undefined);
    } else {
      obj.codecs = [];
    }
    message.stereo !== undefined && (obj.stereo = message.stereo);
    message.disableRed !== undefined && (obj.disableRed = message.disableRed);
    message.encryption !== undefined && (obj.encryption = encryption_TypeToJSON(message.encryption));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<TrackInfo>, I>>(object: I): TrackInfo {
    const message = createBaseTrackInfo();
    message.sid = object.sid ?? "";
    message.type = object.type ?? 0;
    message.name = object.name ?? "";
    message.muted = object.muted ?? false;
    message.width = object.width ?? 0;
    message.height = object.height ?? 0;
    message.simulcast = object.simulcast ?? false;
    message.disableDtx = object.disableDtx ?? false;
    message.source = object.source ?? 0;
    message.layers = object.layers?.map((e) => VideoLayer.fromPartial(e)) || [];
    message.mimeType = object.mimeType ?? "";
    message.mid = object.mid ?? "";
    message.codecs = object.codecs?.map((e) => SimulcastCodecInfo.fromPartial(e)) || [];
    message.stereo = object.stereo ?? false;
    message.disableRed = object.disableRed ?? false;
    message.encryption = object.encryption ?? 0;
    return message;
  },
};

function createBaseVideoLayer(): VideoLayer {
  return { quality: 0, width: 0, height: 0, bitrate: 0, ssrc: 0 };
}

export const VideoLayer = {
  encode(message: VideoLayer, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.quality !== 0) {
      writer.uint32(8).int32(message.quality);
    }
    if (message.width !== 0) {
      writer.uint32(16).uint32(message.width);
    }
    if (message.height !== 0) {
      writer.uint32(24).uint32(message.height);
    }
    if (message.bitrate !== 0) {
      writer.uint32(32).uint32(message.bitrate);
    }
    if (message.ssrc !== 0) {
      writer.uint32(40).uint32(message.ssrc);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): VideoLayer {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseVideoLayer();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.quality = reader.int32() as any;
          break;
        case 2:
          message.width = reader.uint32();
          break;
        case 3:
          message.height = reader.uint32();
          break;
        case 4:
          message.bitrate = reader.uint32();
          break;
        case 5:
          message.ssrc = reader.uint32();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): VideoLayer {
    return {
      quality: isSet(object.quality) ? videoQualityFromJSON(object.quality) : 0,
      width: isSet(object.width) ? Number(object.width) : 0,
      height: isSet(object.height) ? Number(object.height) : 0,
      bitrate: isSet(object.bitrate) ? Number(object.bitrate) : 0,
      ssrc: isSet(object.ssrc) ? Number(object.ssrc) : 0,
    };
  },

  toJSON(message: VideoLayer): unknown {
    const obj: any = {};
    message.quality !== undefined && (obj.quality = videoQualityToJSON(message.quality));
    message.width !== undefined && (obj.width = Math.round(message.width));
    message.height !== undefined && (obj.height = Math.round(message.height));
    message.bitrate !== undefined && (obj.bitrate = Math.round(message.bitrate));
    message.ssrc !== undefined && (obj.ssrc = Math.round(message.ssrc));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<VideoLayer>, I>>(object: I): VideoLayer {
    const message = createBaseVideoLayer();
    message.quality = object.quality ?? 0;
    message.width = object.width ?? 0;
    message.height = object.height ?? 0;
    message.bitrate = object.bitrate ?? 0;
    message.ssrc = object.ssrc ?? 0;
    return message;
  },
};

function createBaseDataPacket(): DataPacket {
  return { kind: 0, value: undefined };
}

export const DataPacket = {
  encode(message: DataPacket, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.kind !== 0) {
      writer.uint32(8).int32(message.kind);
    }
    if (message.value?.$case === "user") {
      UserPacket.encode(message.value.user, writer.uint32(18).fork()).ldelim();
    }
    if (message.value?.$case === "speaker") {
      ActiveSpeakerUpdate.encode(message.value.speaker, writer.uint32(26).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): DataPacket {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseDataPacket();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.kind = reader.int32() as any;
          break;
        case 2:
          message.value = { $case: "user", user: UserPacket.decode(reader, reader.uint32()) };
          break;
        case 3:
          message.value = { $case: "speaker", speaker: ActiveSpeakerUpdate.decode(reader, reader.uint32()) };
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): DataPacket {
    return {
      kind: isSet(object.kind) ? dataPacket_KindFromJSON(object.kind) : 0,
      value: isSet(object.user)
        ? { $case: "user", user: UserPacket.fromJSON(object.user) }
        : isSet(object.speaker)
        ? { $case: "speaker", speaker: ActiveSpeakerUpdate.fromJSON(object.speaker) }
        : undefined,
    };
  },

  toJSON(message: DataPacket): unknown {
    const obj: any = {};
    message.kind !== undefined && (obj.kind = dataPacket_KindToJSON(message.kind));
    message.value?.$case === "user" &&
      (obj.user = message.value?.user ? UserPacket.toJSON(message.value?.user) : undefined);
    message.value?.$case === "speaker" &&
      (obj.speaker = message.value?.speaker ? ActiveSpeakerUpdate.toJSON(message.value?.speaker) : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<DataPacket>, I>>(object: I): DataPacket {
    const message = createBaseDataPacket();
    message.kind = object.kind ?? 0;
    if (object.value?.$case === "user" && object.value?.user !== undefined && object.value?.user !== null) {
      message.value = { $case: "user", user: UserPacket.fromPartial(object.value.user) };
    }
    if (object.value?.$case === "speaker" && object.value?.speaker !== undefined && object.value?.speaker !== null) {
      message.value = { $case: "speaker", speaker: ActiveSpeakerUpdate.fromPartial(object.value.speaker) };
    }
    return message;
  },
};

function createBaseActiveSpeakerUpdate(): ActiveSpeakerUpdate {
  return { speakers: [] };
}

export const ActiveSpeakerUpdate = {
  encode(message: ActiveSpeakerUpdate, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    for (const v of message.speakers) {
      SpeakerInfo.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ActiveSpeakerUpdate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseActiveSpeakerUpdate();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.speakers.push(SpeakerInfo.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ActiveSpeakerUpdate {
    return {
      speakers: Array.isArray(object?.speakers) ? object.speakers.map((e: any) => SpeakerInfo.fromJSON(e)) : [],
    };
  },

  toJSON(message: ActiveSpeakerUpdate): unknown {
    const obj: any = {};
    if (message.speakers) {
      obj.speakers = message.speakers.map((e) => e ? SpeakerInfo.toJSON(e) : undefined);
    } else {
      obj.speakers = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ActiveSpeakerUpdate>, I>>(object: I): ActiveSpeakerUpdate {
    const message = createBaseActiveSpeakerUpdate();
    message.speakers = object.speakers?.map((e) => SpeakerInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseSpeakerInfo(): SpeakerInfo {
  return { sid: "", level: 0, active: false };
}

export const SpeakerInfo = {
  encode(message: SpeakerInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.sid !== "") {
      writer.uint32(10).string(message.sid);
    }
    if (message.level !== 0) {
      writer.uint32(21).float(message.level);
    }
    if (message.active === true) {
      writer.uint32(24).bool(message.active);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SpeakerInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseSpeakerInfo();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sid = reader.string();
          break;
        case 2:
          message.level = reader.float();
          break;
        case 3:
          message.active = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SpeakerInfo {
    return {
      sid: isSet(object.sid) ? String(object.sid) : "",
      level: isSet(object.level) ? Number(object.level) : 0,
      active: isSet(object.active) ? Boolean(object.active) : false,
    };
  },

  toJSON(message: SpeakerInfo): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.level !== undefined && (obj.level = message.level);
    message.active !== undefined && (obj.active = message.active);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SpeakerInfo>, I>>(object: I): SpeakerInfo {
    const message = createBaseSpeakerInfo();
    message.sid = object.sid ?? "";
    message.level = object.level ?? 0;
    message.active = object.active ?? false;
    return message;
  },
};

function createBaseUserPacket(): UserPacket {
  return { participantSid: "", payload: new Uint8Array(), destinationSids: [] };
}

export const UserPacket = {
  encode(message: UserPacket, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.participantSid !== "") {
      writer.uint32(10).string(message.participantSid);
    }
    if (message.payload.length !== 0) {
      writer.uint32(18).bytes(message.payload);
    }
    for (const v of message.destinationSids) {
      writer.uint32(26).string(v!);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): UserPacket {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseUserPacket();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.participantSid = reader.string();
          break;
        case 2:
          message.payload = reader.bytes();
          break;
        case 3:
          message.destinationSids.push(reader.string());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): UserPacket {
    return {
      participantSid: isSet(object.participantSid) ? String(object.participantSid) : "",
      payload: isSet(object.payload) ? bytesFromBase64(object.payload) : new Uint8Array(),
      destinationSids: Array.isArray(object?.destinationSids) ? object.destinationSids.map((e: any) => String(e)) : [],
    };
  },

  toJSON(message: UserPacket): unknown {
    const obj: any = {};
    message.participantSid !== undefined && (obj.participantSid = message.participantSid);
    message.payload !== undefined &&
      (obj.payload = base64FromBytes(message.payload !== undefined ? message.payload : new Uint8Array()));
    if (message.destinationSids) {
      obj.destinationSids = message.destinationSids.map((e) => e);
    } else {
      obj.destinationSids = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<UserPacket>, I>>(object: I): UserPacket {
    const message = createBaseUserPacket();
    message.participantSid = object.participantSid ?? "";
    message.payload = object.payload ?? new Uint8Array();
    message.destinationSids = object.destinationSids?.map((e) => e) || [];
    return message;
  },
};

function createBaseParticipantTracks(): ParticipantTracks {
  return { participantSid: "", trackSids: [] };
}

export const ParticipantTracks = {
  encode(message: ParticipantTracks, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.participantSid !== "") {
      writer.uint32(10).string(message.participantSid);
    }
    for (const v of message.trackSids) {
      writer.uint32(18).string(v!);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ParticipantTracks {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseParticipantTracks();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.participantSid = reader.string();
          break;
        case 2:
          message.trackSids.push(reader.string());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ParticipantTracks {
    return {
      participantSid: isSet(object.participantSid) ? String(object.participantSid) : "",
      trackSids: Array.isArray(object?.trackSids) ? object.trackSids.map((e: any) => String(e)) : [],
    };
  },

  toJSON(message: ParticipantTracks): unknown {
    const obj: any = {};
    message.participantSid !== undefined && (obj.participantSid = message.participantSid);
    if (message.trackSids) {
      obj.trackSids = message.trackSids.map((e) => e);
    } else {
      obj.trackSids = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ParticipantTracks>, I>>(object: I): ParticipantTracks {
    const message = createBaseParticipantTracks();
    message.participantSid = object.participantSid ?? "";
    message.trackSids = object.trackSids?.map((e) => e) || [];
    return message;
  },
};

function createBaseServerInfo(): ServerInfo {
  return { edition: 0, version: "", protocol: 0, region: "", nodeId: "", debugInfo: "" };
}

export const ServerInfo = {
  encode(message: ServerInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.edition !== 0) {
      writer.uint32(8).int32(message.edition);
    }
    if (message.version !== "") {
      writer.uint32(18).string(message.version);
    }
    if (message.protocol !== 0) {
      writer.uint32(24).int32(message.protocol);
    }
    if (message.region !== "") {
      writer.uint32(34).string(message.region);
    }
    if (message.nodeId !== "") {
      writer.uint32(42).string(message.nodeId);
    }
    if (message.debugInfo !== "") {
      writer.uint32(50).string(message.debugInfo);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ServerInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseServerInfo();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.edition = reader.int32() as any;
          break;
        case 2:
          message.version = reader.string();
          break;
        case 3:
          message.protocol = reader.int32();
          break;
        case 4:
          message.region = reader.string();
          break;
        case 5:
          message.nodeId = reader.string();
          break;
        case 6:
          message.debugInfo = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ServerInfo {
    return {
      edition: isSet(object.edition) ? serverInfo_EditionFromJSON(object.edition) : 0,
      version: isSet(object.version) ? String(object.version) : "",
      protocol: isSet(object.protocol) ? Number(object.protocol) : 0,
      region: isSet(object.region) ? String(object.region) : "",
      nodeId: isSet(object.nodeId) ? String(object.nodeId) : "",
      debugInfo: isSet(object.debugInfo) ? String(object.debugInfo) : "",
    };
  },

  toJSON(message: ServerInfo): unknown {
    const obj: any = {};
    message.edition !== undefined && (obj.edition = serverInfo_EditionToJSON(message.edition));
    message.version !== undefined && (obj.version = message.version);
    message.protocol !== undefined && (obj.protocol = Math.round(message.protocol));
    message.region !== undefined && (obj.region = message.region);
    message.nodeId !== undefined && (obj.nodeId = message.nodeId);
    message.debugInfo !== undefined && (obj.debugInfo = message.debugInfo);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ServerInfo>, I>>(object: I): ServerInfo {
    const message = createBaseServerInfo();
    message.edition = object.edition ?? 0;
    message.version = object.version ?? "";
    message.protocol = object.protocol ?? 0;
    message.region = object.region ?? "";
    message.nodeId = object.nodeId ?? "";
    message.debugInfo = object.debugInfo ?? "";
    return message;
  },
};

function createBaseClientInfo(): ClientInfo {
  return {
    sdk: 0,
    version: "",
    protocol: 0,
    os: "",
    osVersion: "",
    deviceModel: "",
    browser: "",
    browserVersion: "",
    address: "",
    network: "",
  };
}

export const ClientInfo = {
  encode(message: ClientInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.sdk !== 0) {
      writer.uint32(8).int32(message.sdk);
    }
    if (message.version !== "") {
      writer.uint32(18).string(message.version);
    }
    if (message.protocol !== 0) {
      writer.uint32(24).int32(message.protocol);
    }
    if (message.os !== "") {
      writer.uint32(34).string(message.os);
    }
    if (message.osVersion !== "") {
      writer.uint32(42).string(message.osVersion);
    }
    if (message.deviceModel !== "") {
      writer.uint32(50).string(message.deviceModel);
    }
    if (message.browser !== "") {
      writer.uint32(58).string(message.browser);
    }
    if (message.browserVersion !== "") {
      writer.uint32(66).string(message.browserVersion);
    }
    if (message.address !== "") {
      writer.uint32(74).string(message.address);
    }
    if (message.network !== "") {
      writer.uint32(82).string(message.network);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ClientInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseClientInfo();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sdk = reader.int32() as any;
          break;
        case 2:
          message.version = reader.string();
          break;
        case 3:
          message.protocol = reader.int32();
          break;
        case 4:
          message.os = reader.string();
          break;
        case 5:
          message.osVersion = reader.string();
          break;
        case 6:
          message.deviceModel = reader.string();
          break;
        case 7:
          message.browser = reader.string();
          break;
        case 8:
          message.browserVersion = reader.string();
          break;
        case 9:
          message.address = reader.string();
          break;
        case 10:
          message.network = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ClientInfo {
    return {
      sdk: isSet(object.sdk) ? clientInfo_SDKFromJSON(object.sdk) : 0,
      version: isSet(object.version) ? String(object.version) : "",
      protocol: isSet(object.protocol) ? Number(object.protocol) : 0,
      os: isSet(object.os) ? String(object.os) : "",
      osVersion: isSet(object.osVersion) ? String(object.osVersion) : "",
      deviceModel: isSet(object.deviceModel) ? String(object.deviceModel) : "",
      browser: isSet(object.browser) ? String(object.browser) : "",
      browserVersion: isSet(object.browserVersion) ? String(object.browserVersion) : "",
      address: isSet(object.address) ? String(object.address) : "",
      network: isSet(object.network) ? String(object.network) : "",
    };
  },

  toJSON(message: ClientInfo): unknown {
    const obj: any = {};
    message.sdk !== undefined && (obj.sdk = clientInfo_SDKToJSON(message.sdk));
    message.version !== undefined && (obj.version = message.version);
    message.protocol !== undefined && (obj.protocol = Math.round(message.protocol));
    message.os !== undefined && (obj.os = message.os);
    message.osVersion !== undefined && (obj.osVersion = message.osVersion);
    message.deviceModel !== undefined && (obj.deviceModel = message.deviceModel);
    message.browser !== undefined && (obj.browser = message.browser);
    message.browserVersion !== undefined && (obj.browserVersion = message.browserVersion);
    message.address !== undefined && (obj.address = message.address);
    message.network !== undefined && (obj.network = message.network);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ClientInfo>, I>>(object: I): ClientInfo {
    const message = createBaseClientInfo();
    message.sdk = object.sdk ?? 0;
    message.version = object.version ?? "";
    message.protocol = object.protocol ?? 0;
    message.os = object.os ?? "";
    message.osVersion = object.osVersion ?? "";
    message.deviceModel = object.deviceModel ?? "";
    message.browser = object.browser ?? "";
    message.browserVersion = object.browserVersion ?? "";
    message.address = object.address ?? "";
    message.network = object.network ?? "";
    return message;
  },
};

function createBaseClientConfiguration(): ClientConfiguration {
  return { video: undefined, screen: undefined, resumeConnection: 0, disabledCodecs: undefined, forceRelay: 0 };
}

export const ClientConfiguration = {
  encode(message: ClientConfiguration, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.video !== undefined) {
      VideoConfiguration.encode(message.video, writer.uint32(10).fork()).ldelim();
    }
    if (message.screen !== undefined) {
      VideoConfiguration.encode(message.screen, writer.uint32(18).fork()).ldelim();
    }
    if (message.resumeConnection !== 0) {
      writer.uint32(24).int32(message.resumeConnection);
    }
    if (message.disabledCodecs !== undefined) {
      DisabledCodecs.encode(message.disabledCodecs, writer.uint32(34).fork()).ldelim();
    }
    if (message.forceRelay !== 0) {
      writer.uint32(40).int32(message.forceRelay);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ClientConfiguration {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseClientConfiguration();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.video = VideoConfiguration.decode(reader, reader.uint32());
          break;
        case 2:
          message.screen = VideoConfiguration.decode(reader, reader.uint32());
          break;
        case 3:
          message.resumeConnection = reader.int32() as any;
          break;
        case 4:
          message.disabledCodecs = DisabledCodecs.decode(reader, reader.uint32());
          break;
        case 5:
          message.forceRelay = reader.int32() as any;
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ClientConfiguration {
    return {
      video: isSet(object.video) ? VideoConfiguration.fromJSON(object.video) : undefined,
      screen: isSet(object.screen) ? VideoConfiguration.fromJSON(object.screen) : undefined,
      resumeConnection: isSet(object.resumeConnection) ? clientConfigSettingFromJSON(object.resumeConnection) : 0,
      disabledCodecs: isSet(object.disabledCodecs) ? DisabledCodecs.fromJSON(object.disabledCodecs) : undefined,
      forceRelay: isSet(object.forceRelay) ? clientConfigSettingFromJSON(object.forceRelay) : 0,
    };
  },

  toJSON(message: ClientConfiguration): unknown {
    const obj: any = {};
    message.video !== undefined && (obj.video = message.video ? VideoConfiguration.toJSON(message.video) : undefined);
    message.screen !== undefined &&
      (obj.screen = message.screen ? VideoConfiguration.toJSON(message.screen) : undefined);
    message.resumeConnection !== undefined &&
      (obj.resumeConnection = clientConfigSettingToJSON(message.resumeConnection));
    message.disabledCodecs !== undefined &&
      (obj.disabledCodecs = message.disabledCodecs ? DisabledCodecs.toJSON(message.disabledCodecs) : undefined);
    message.forceRelay !== undefined && (obj.forceRelay = clientConfigSettingToJSON(message.forceRelay));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ClientConfiguration>, I>>(object: I): ClientConfiguration {
    const message = createBaseClientConfiguration();
    message.video = (object.video !== undefined && object.video !== null)
      ? VideoConfiguration.fromPartial(object.video)
      : undefined;
    message.screen = (object.screen !== undefined && object.screen !== null)
      ? VideoConfiguration.fromPartial(object.screen)
      : undefined;
    message.resumeConnection = object.resumeConnection ?? 0;
    message.disabledCodecs = (object.disabledCodecs !== undefined && object.disabledCodecs !== null)
      ? DisabledCodecs.fromPartial(object.disabledCodecs)
      : undefined;
    message.forceRelay = object.forceRelay ?? 0;
    return message;
  },
};

function createBaseVideoConfiguration(): VideoConfiguration {
  return { hardwareEncoder: 0 };
}

export const VideoConfiguration = {
  encode(message: VideoConfiguration, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.hardwareEncoder !== 0) {
      writer.uint32(8).int32(message.hardwareEncoder);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): VideoConfiguration {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseVideoConfiguration();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.hardwareEncoder = reader.int32() as any;
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): VideoConfiguration {
    return { hardwareEncoder: isSet(object.hardwareEncoder) ? clientConfigSettingFromJSON(object.hardwareEncoder) : 0 };
  },

  toJSON(message: VideoConfiguration): unknown {
    const obj: any = {};
    message.hardwareEncoder !== undefined && (obj.hardwareEncoder = clientConfigSettingToJSON(message.hardwareEncoder));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<VideoConfiguration>, I>>(object: I): VideoConfiguration {
    const message = createBaseVideoConfiguration();
    message.hardwareEncoder = object.hardwareEncoder ?? 0;
    return message;
  },
};

function createBaseDisabledCodecs(): DisabledCodecs {
  return { codecs: [] };
}

export const DisabledCodecs = {
  encode(message: DisabledCodecs, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    for (const v of message.codecs) {
      Codec.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): DisabledCodecs {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseDisabledCodecs();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.codecs.push(Codec.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): DisabledCodecs {
    return { codecs: Array.isArray(object?.codecs) ? object.codecs.map((e: any) => Codec.fromJSON(e)) : [] };
  },

  toJSON(message: DisabledCodecs): unknown {
    const obj: any = {};
    if (message.codecs) {
      obj.codecs = message.codecs.map((e) => e ? Codec.toJSON(e) : undefined);
    } else {
      obj.codecs = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<DisabledCodecs>, I>>(object: I): DisabledCodecs {
    const message = createBaseDisabledCodecs();
    message.codecs = object.codecs?.map((e) => Codec.fromPartial(e)) || [];
    return message;
  },
};

function createBaseRTPStats(): RTPStats {
  return {
    startTime: undefined,
    endTime: undefined,
    duration: 0,
    packets: 0,
    packetRate: 0,
    bytes: 0,
    headerBytes: 0,
    bitrate: 0,
    packetsLost: 0,
    packetLossRate: 0,
    packetLossPercentage: 0,
    packetsDuplicate: 0,
    packetDuplicateRate: 0,
    bytesDuplicate: 0,
    headerBytesDuplicate: 0,
    bitrateDuplicate: 0,
    packetsPadding: 0,
    packetPaddingRate: 0,
    bytesPadding: 0,
    headerBytesPadding: 0,
    bitratePadding: 0,
    packetsOutOfOrder: 0,
    frames: 0,
    frameRate: 0,
    jitterCurrent: 0,
    jitterMax: 0,
    gapHistogram: {},
    nacks: 0,
    nackAcks: 0,
    nackMisses: 0,
    nackRepeated: 0,
    plis: 0,
    lastPli: undefined,
    firs: 0,
    lastFir: undefined,
    rttCurrent: 0,
    rttMax: 0,
    keyFrames: 0,
    lastKeyFrame: undefined,
    layerLockPlis: 0,
    lastLayerLockPli: undefined,
  };
}

export const RTPStats = {
  encode(message: RTPStats, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.startTime !== undefined) {
      Timestamp.encode(toTimestamp(message.startTime), writer.uint32(10).fork()).ldelim();
    }
    if (message.endTime !== undefined) {
      Timestamp.encode(toTimestamp(message.endTime), writer.uint32(18).fork()).ldelim();
    }
    if (message.duration !== 0) {
      writer.uint32(25).double(message.duration);
    }
    if (message.packets !== 0) {
      writer.uint32(32).uint32(message.packets);
    }
    if (message.packetRate !== 0) {
      writer.uint32(41).double(message.packetRate);
    }
    if (message.bytes !== 0) {
      writer.uint32(48).uint64(message.bytes);
    }
    if (message.headerBytes !== 0) {
      writer.uint32(312).uint64(message.headerBytes);
    }
    if (message.bitrate !== 0) {
      writer.uint32(57).double(message.bitrate);
    }
    if (message.packetsLost !== 0) {
      writer.uint32(64).uint32(message.packetsLost);
    }
    if (message.packetLossRate !== 0) {
      writer.uint32(73).double(message.packetLossRate);
    }
    if (message.packetLossPercentage !== 0) {
      writer.uint32(85).float(message.packetLossPercentage);
    }
    if (message.packetsDuplicate !== 0) {
      writer.uint32(88).uint32(message.packetsDuplicate);
    }
    if (message.packetDuplicateRate !== 0) {
      writer.uint32(97).double(message.packetDuplicateRate);
    }
    if (message.bytesDuplicate !== 0) {
      writer.uint32(104).uint64(message.bytesDuplicate);
    }
    if (message.headerBytesDuplicate !== 0) {
      writer.uint32(320).uint64(message.headerBytesDuplicate);
    }
    if (message.bitrateDuplicate !== 0) {
      writer.uint32(113).double(message.bitrateDuplicate);
    }
    if (message.packetsPadding !== 0) {
      writer.uint32(120).uint32(message.packetsPadding);
    }
    if (message.packetPaddingRate !== 0) {
      writer.uint32(129).double(message.packetPaddingRate);
    }
    if (message.bytesPadding !== 0) {
      writer.uint32(136).uint64(message.bytesPadding);
    }
    if (message.headerBytesPadding !== 0) {
      writer.uint32(328).uint64(message.headerBytesPadding);
    }
    if (message.bitratePadding !== 0) {
      writer.uint32(145).double(message.bitratePadding);
    }
    if (message.packetsOutOfOrder !== 0) {
      writer.uint32(152).uint32(message.packetsOutOfOrder);
    }
    if (message.frames !== 0) {
      writer.uint32(160).uint32(message.frames);
    }
    if (message.frameRate !== 0) {
      writer.uint32(169).double(message.frameRate);
    }
    if (message.jitterCurrent !== 0) {
      writer.uint32(177).double(message.jitterCurrent);
    }
    if (message.jitterMax !== 0) {
      writer.uint32(185).double(message.jitterMax);
    }
    Object.entries(message.gapHistogram).forEach(([key, value]) => {
      RTPStats_GapHistogramEntry.encode({ key: key as any, value }, writer.uint32(194).fork()).ldelim();
    });
    if (message.nacks !== 0) {
      writer.uint32(200).uint32(message.nacks);
    }
    if (message.nackAcks !== 0) {
      writer.uint32(296).uint32(message.nackAcks);
    }
    if (message.nackMisses !== 0) {
      writer.uint32(208).uint32(message.nackMisses);
    }
    if (message.nackRepeated !== 0) {
      writer.uint32(304).uint32(message.nackRepeated);
    }
    if (message.plis !== 0) {
      writer.uint32(216).uint32(message.plis);
    }
    if (message.lastPli !== undefined) {
      Timestamp.encode(toTimestamp(message.lastPli), writer.uint32(226).fork()).ldelim();
    }
    if (message.firs !== 0) {
      writer.uint32(232).uint32(message.firs);
    }
    if (message.lastFir !== undefined) {
      Timestamp.encode(toTimestamp(message.lastFir), writer.uint32(242).fork()).ldelim();
    }
    if (message.rttCurrent !== 0) {
      writer.uint32(248).uint32(message.rttCurrent);
    }
    if (message.rttMax !== 0) {
      writer.uint32(256).uint32(message.rttMax);
    }
    if (message.keyFrames !== 0) {
      writer.uint32(264).uint32(message.keyFrames);
    }
    if (message.lastKeyFrame !== undefined) {
      Timestamp.encode(toTimestamp(message.lastKeyFrame), writer.uint32(274).fork()).ldelim();
    }
    if (message.layerLockPlis !== 0) {
      writer.uint32(280).uint32(message.layerLockPlis);
    }
    if (message.lastLayerLockPli !== undefined) {
      Timestamp.encode(toTimestamp(message.lastLayerLockPli), writer.uint32(290).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RTPStats {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRTPStats();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.startTime = fromTimestamp(Timestamp.decode(reader, reader.uint32()));
          break;
        case 2:
          message.endTime = fromTimestamp(Timestamp.decode(reader, reader.uint32()));
          break;
        case 3:
          message.duration = reader.double();
          break;
        case 4:
          message.packets = reader.uint32();
          break;
        case 5:
          message.packetRate = reader.double();
          break;
        case 6:
          message.bytes = longToNumber(reader.uint64() as Long);
          break;
        case 39:
          message.headerBytes = longToNumber(reader.uint64() as Long);
          break;
        case 7:
          message.bitrate = reader.double();
          break;
        case 8:
          message.packetsLost = reader.uint32();
          break;
        case 9:
          message.packetLossRate = reader.double();
          break;
        case 10:
          message.packetLossPercentage = reader.float();
          break;
        case 11:
          message.packetsDuplicate = reader.uint32();
          break;
        case 12:
          message.packetDuplicateRate = reader.double();
          break;
        case 13:
          message.bytesDuplicate = longToNumber(reader.uint64() as Long);
          break;
        case 40:
          message.headerBytesDuplicate = longToNumber(reader.uint64() as Long);
          break;
        case 14:
          message.bitrateDuplicate = reader.double();
          break;
        case 15:
          message.packetsPadding = reader.uint32();
          break;
        case 16:
          message.packetPaddingRate = reader.double();
          break;
        case 17:
          message.bytesPadding = longToNumber(reader.uint64() as Long);
          break;
        case 41:
          message.headerBytesPadding = longToNumber(reader.uint64() as Long);
          break;
        case 18:
          message.bitratePadding = reader.double();
          break;
        case 19:
          message.packetsOutOfOrder = reader.uint32();
          break;
        case 20:
          message.frames = reader.uint32();
          break;
        case 21:
          message.frameRate = reader.double();
          break;
        case 22:
          message.jitterCurrent = reader.double();
          break;
        case 23:
          message.jitterMax = reader.double();
          break;
        case 24:
          const entry24 = RTPStats_GapHistogramEntry.decode(reader, reader.uint32());
          if (entry24.value !== undefined) {
            message.gapHistogram[entry24.key] = entry24.value;
          }
          break;
        case 25:
          message.nacks = reader.uint32();
          break;
        case 37:
          message.nackAcks = reader.uint32();
          break;
        case 26:
          message.nackMisses = reader.uint32();
          break;
        case 38:
          message.nackRepeated = reader.uint32();
          break;
        case 27:
          message.plis = reader.uint32();
          break;
        case 28:
          message.lastPli = fromTimestamp(Timestamp.decode(reader, reader.uint32()));
          break;
        case 29:
          message.firs = reader.uint32();
          break;
        case 30:
          message.lastFir = fromTimestamp(Timestamp.decode(reader, reader.uint32()));
          break;
        case 31:
          message.rttCurrent = reader.uint32();
          break;
        case 32:
          message.rttMax = reader.uint32();
          break;
        case 33:
          message.keyFrames = reader.uint32();
          break;
        case 34:
          message.lastKeyFrame = fromTimestamp(Timestamp.decode(reader, reader.uint32()));
          break;
        case 35:
          message.layerLockPlis = reader.uint32();
          break;
        case 36:
          message.lastLayerLockPli = fromTimestamp(Timestamp.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): RTPStats {
    return {
      startTime: isSet(object.startTime) ? fromJsonTimestamp(object.startTime) : undefined,
      endTime: isSet(object.endTime) ? fromJsonTimestamp(object.endTime) : undefined,
      duration: isSet(object.duration) ? Number(object.duration) : 0,
      packets: isSet(object.packets) ? Number(object.packets) : 0,
      packetRate: isSet(object.packetRate) ? Number(object.packetRate) : 0,
      bytes: isSet(object.bytes) ? Number(object.bytes) : 0,
      headerBytes: isSet(object.headerBytes) ? Number(object.headerBytes) : 0,
      bitrate: isSet(object.bitrate) ? Number(object.bitrate) : 0,
      packetsLost: isSet(object.packetsLost) ? Number(object.packetsLost) : 0,
      packetLossRate: isSet(object.packetLossRate) ? Number(object.packetLossRate) : 0,
      packetLossPercentage: isSet(object.packetLossPercentage) ? Number(object.packetLossPercentage) : 0,
      packetsDuplicate: isSet(object.packetsDuplicate) ? Number(object.packetsDuplicate) : 0,
      packetDuplicateRate: isSet(object.packetDuplicateRate) ? Number(object.packetDuplicateRate) : 0,
      bytesDuplicate: isSet(object.bytesDuplicate) ? Number(object.bytesDuplicate) : 0,
      headerBytesDuplicate: isSet(object.headerBytesDuplicate) ? Number(object.headerBytesDuplicate) : 0,
      bitrateDuplicate: isSet(object.bitrateDuplicate) ? Number(object.bitrateDuplicate) : 0,
      packetsPadding: isSet(object.packetsPadding) ? Number(object.packetsPadding) : 0,
      packetPaddingRate: isSet(object.packetPaddingRate) ? Number(object.packetPaddingRate) : 0,
      bytesPadding: isSet(object.bytesPadding) ? Number(object.bytesPadding) : 0,
      headerBytesPadding: isSet(object.headerBytesPadding) ? Number(object.headerBytesPadding) : 0,
      bitratePadding: isSet(object.bitratePadding) ? Number(object.bitratePadding) : 0,
      packetsOutOfOrder: isSet(object.packetsOutOfOrder) ? Number(object.packetsOutOfOrder) : 0,
      frames: isSet(object.frames) ? Number(object.frames) : 0,
      frameRate: isSet(object.frameRate) ? Number(object.frameRate) : 0,
      jitterCurrent: isSet(object.jitterCurrent) ? Number(object.jitterCurrent) : 0,
      jitterMax: isSet(object.jitterMax) ? Number(object.jitterMax) : 0,
      gapHistogram: isObject(object.gapHistogram)
        ? Object.entries(object.gapHistogram).reduce<{ [key: number]: number }>((acc, [key, value]) => {
          acc[Number(key)] = Number(value);
          return acc;
        }, {})
        : {},
      nacks: isSet(object.nacks) ? Number(object.nacks) : 0,
      nackAcks: isSet(object.nackAcks) ? Number(object.nackAcks) : 0,
      nackMisses: isSet(object.nackMisses) ? Number(object.nackMisses) : 0,
      nackRepeated: isSet(object.nackRepeated) ? Number(object.nackRepeated) : 0,
      plis: isSet(object.plis) ? Number(object.plis) : 0,
      lastPli: isSet(object.lastPli) ? fromJsonTimestamp(object.lastPli) : undefined,
      firs: isSet(object.firs) ? Number(object.firs) : 0,
      lastFir: isSet(object.lastFir) ? fromJsonTimestamp(object.lastFir) : undefined,
      rttCurrent: isSet(object.rttCurrent) ? Number(object.rttCurrent) : 0,
      rttMax: isSet(object.rttMax) ? Number(object.rttMax) : 0,
      keyFrames: isSet(object.keyFrames) ? Number(object.keyFrames) : 0,
      lastKeyFrame: isSet(object.lastKeyFrame) ? fromJsonTimestamp(object.lastKeyFrame) : undefined,
      layerLockPlis: isSet(object.layerLockPlis) ? Number(object.layerLockPlis) : 0,
      lastLayerLockPli: isSet(object.lastLayerLockPli) ? fromJsonTimestamp(object.lastLayerLockPli) : undefined,
    };
  },

  toJSON(message: RTPStats): unknown {
    const obj: any = {};
    message.startTime !== undefined && (obj.startTime = message.startTime.toISOString());
    message.endTime !== undefined && (obj.endTime = message.endTime.toISOString());
    message.duration !== undefined && (obj.duration = message.duration);
    message.packets !== undefined && (obj.packets = Math.round(message.packets));
    message.packetRate !== undefined && (obj.packetRate = message.packetRate);
    message.bytes !== undefined && (obj.bytes = Math.round(message.bytes));
    message.headerBytes !== undefined && (obj.headerBytes = Math.round(message.headerBytes));
    message.bitrate !== undefined && (obj.bitrate = message.bitrate);
    message.packetsLost !== undefined && (obj.packetsLost = Math.round(message.packetsLost));
    message.packetLossRate !== undefined && (obj.packetLossRate = message.packetLossRate);
    message.packetLossPercentage !== undefined && (obj.packetLossPercentage = message.packetLossPercentage);
    message.packetsDuplicate !== undefined && (obj.packetsDuplicate = Math.round(message.packetsDuplicate));
    message.packetDuplicateRate !== undefined && (obj.packetDuplicateRate = message.packetDuplicateRate);
    message.bytesDuplicate !== undefined && (obj.bytesDuplicate = Math.round(message.bytesDuplicate));
    message.headerBytesDuplicate !== undefined && (obj.headerBytesDuplicate = Math.round(message.headerBytesDuplicate));
    message.bitrateDuplicate !== undefined && (obj.bitrateDuplicate = message.bitrateDuplicate);
    message.packetsPadding !== undefined && (obj.packetsPadding = Math.round(message.packetsPadding));
    message.packetPaddingRate !== undefined && (obj.packetPaddingRate = message.packetPaddingRate);
    message.bytesPadding !== undefined && (obj.bytesPadding = Math.round(message.bytesPadding));
    message.headerBytesPadding !== undefined && (obj.headerBytesPadding = Math.round(message.headerBytesPadding));
    message.bitratePadding !== undefined && (obj.bitratePadding = message.bitratePadding);
    message.packetsOutOfOrder !== undefined && (obj.packetsOutOfOrder = Math.round(message.packetsOutOfOrder));
    message.frames !== undefined && (obj.frames = Math.round(message.frames));
    message.frameRate !== undefined && (obj.frameRate = message.frameRate);
    message.jitterCurrent !== undefined && (obj.jitterCurrent = message.jitterCurrent);
    message.jitterMax !== undefined && (obj.jitterMax = message.jitterMax);
    obj.gapHistogram = {};
    if (message.gapHistogram) {
      Object.entries(message.gapHistogram).forEach(([k, v]) => {
        obj.gapHistogram[k] = Math.round(v);
      });
    }
    message.nacks !== undefined && (obj.nacks = Math.round(message.nacks));
    message.nackAcks !== undefined && (obj.nackAcks = Math.round(message.nackAcks));
    message.nackMisses !== undefined && (obj.nackMisses = Math.round(message.nackMisses));
    message.nackRepeated !== undefined && (obj.nackRepeated = Math.round(message.nackRepeated));
    message.plis !== undefined && (obj.plis = Math.round(message.plis));
    message.lastPli !== undefined && (obj.lastPli = message.lastPli.toISOString());
    message.firs !== undefined && (obj.firs = Math.round(message.firs));
    message.lastFir !== undefined && (obj.lastFir = message.lastFir.toISOString());
    message.rttCurrent !== undefined && (obj.rttCurrent = Math.round(message.rttCurrent));
    message.rttMax !== undefined && (obj.rttMax = Math.round(message.rttMax));
    message.keyFrames !== undefined && (obj.keyFrames = Math.round(message.keyFrames));
    message.lastKeyFrame !== undefined && (obj.lastKeyFrame = message.lastKeyFrame.toISOString());
    message.layerLockPlis !== undefined && (obj.layerLockPlis = Math.round(message.layerLockPlis));
    message.lastLayerLockPli !== undefined && (obj.lastLayerLockPli = message.lastLayerLockPli.toISOString());
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<RTPStats>, I>>(object: I): RTPStats {
    const message = createBaseRTPStats();
    message.startTime = object.startTime ?? undefined;
    message.endTime = object.endTime ?? undefined;
    message.duration = object.duration ?? 0;
    message.packets = object.packets ?? 0;
    message.packetRate = object.packetRate ?? 0;
    message.bytes = object.bytes ?? 0;
    message.headerBytes = object.headerBytes ?? 0;
    message.bitrate = object.bitrate ?? 0;
    message.packetsLost = object.packetsLost ?? 0;
    message.packetLossRate = object.packetLossRate ?? 0;
    message.packetLossPercentage = object.packetLossPercentage ?? 0;
    message.packetsDuplicate = object.packetsDuplicate ?? 0;
    message.packetDuplicateRate = object.packetDuplicateRate ?? 0;
    message.bytesDuplicate = object.bytesDuplicate ?? 0;
    message.headerBytesDuplicate = object.headerBytesDuplicate ?? 0;
    message.bitrateDuplicate = object.bitrateDuplicate ?? 0;
    message.packetsPadding = object.packetsPadding ?? 0;
    message.packetPaddingRate = object.packetPaddingRate ?? 0;
    message.bytesPadding = object.bytesPadding ?? 0;
    message.headerBytesPadding = object.headerBytesPadding ?? 0;
    message.bitratePadding = object.bitratePadding ?? 0;
    message.packetsOutOfOrder = object.packetsOutOfOrder ?? 0;
    message.frames = object.frames ?? 0;
    message.frameRate = object.frameRate ?? 0;
    message.jitterCurrent = object.jitterCurrent ?? 0;
    message.jitterMax = object.jitterMax ?? 0;
    message.gapHistogram = Object.entries(object.gapHistogram ?? {}).reduce<{ [key: number]: number }>(
      (acc, [key, value]) => {
        if (value !== undefined) {
          acc[Number(key)] = Number(value);
        }
        return acc;
      },
      {},
    );
    message.nacks = object.nacks ?? 0;
    message.nackAcks = object.nackAcks ?? 0;
    message.nackMisses = object.nackMisses ?? 0;
    message.nackRepeated = object.nackRepeated ?? 0;
    message.plis = object.plis ?? 0;
    message.lastPli = object.lastPli ?? undefined;
    message.firs = object.firs ?? 0;
    message.lastFir = object.lastFir ?? undefined;
    message.rttCurrent = object.rttCurrent ?? 0;
    message.rttMax = object.rttMax ?? 0;
    message.keyFrames = object.keyFrames ?? 0;
    message.lastKeyFrame = object.lastKeyFrame ?? undefined;
    message.layerLockPlis = object.layerLockPlis ?? 0;
    message.lastLayerLockPli = object.lastLayerLockPli ?? undefined;
    return message;
  },
};

function createBaseRTPStats_GapHistogramEntry(): RTPStats_GapHistogramEntry {
  return { key: 0, value: 0 };
}

export const RTPStats_GapHistogramEntry = {
  encode(message: RTPStats_GapHistogramEntry, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.key !== 0) {
      writer.uint32(8).int32(message.key);
    }
    if (message.value !== 0) {
      writer.uint32(16).uint32(message.value);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RTPStats_GapHistogramEntry {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseRTPStats_GapHistogramEntry();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.key = reader.int32();
          break;
        case 2:
          message.value = reader.uint32();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): RTPStats_GapHistogramEntry {
    return { key: isSet(object.key) ? Number(object.key) : 0, value: isSet(object.value) ? Number(object.value) : 0 };
  },

  toJSON(message: RTPStats_GapHistogramEntry): unknown {
    const obj: any = {};
    message.key !== undefined && (obj.key = Math.round(message.key));
    message.value !== undefined && (obj.value = Math.round(message.value));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<RTPStats_GapHistogramEntry>, I>>(object: I): RTPStats_GapHistogramEntry {
    const message = createBaseRTPStats_GapHistogramEntry();
    message.key = object.key ?? 0;
    message.value = object.value ?? 0;
    return message;
  },
};

function createBaseTimedVersion(): TimedVersion {
  return { unixMicro: 0, ticks: 0 };
}

export const TimedVersion = {
  encode(message: TimedVersion, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.unixMicro !== 0) {
      writer.uint32(8).int64(message.unixMicro);
    }
    if (message.ticks !== 0) {
      writer.uint32(16).int32(message.ticks);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TimedVersion {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseTimedVersion();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.unixMicro = longToNumber(reader.int64() as Long);
          break;
        case 2:
          message.ticks = reader.int32();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): TimedVersion {
    return {
      unixMicro: isSet(object.unixMicro) ? Number(object.unixMicro) : 0,
      ticks: isSet(object.ticks) ? Number(object.ticks) : 0,
    };
  },

  toJSON(message: TimedVersion): unknown {
    const obj: any = {};
    message.unixMicro !== undefined && (obj.unixMicro = Math.round(message.unixMicro));
    message.ticks !== undefined && (obj.ticks = Math.round(message.ticks));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<TimedVersion>, I>>(object: I): TimedVersion {
    const message = createBaseTimedVersion();
    message.unixMicro = object.unixMicro ?? 0;
    message.ticks = object.ticks ?? 0;
    return message;
  },
};

declare var self: any | undefined;
declare var window: any | undefined;
declare var global: any | undefined;
var tsProtoGlobalThis: any = (() => {
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  if (typeof self !== "undefined") {
    return self;
  }
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof global !== "undefined") {
    return global;
  }
  throw "Unable to locate global object";
})();

function bytesFromBase64(b64: string): Uint8Array {
  if (tsProtoGlobalThis.Buffer) {
    return Uint8Array.from(tsProtoGlobalThis.Buffer.from(b64, "base64"));
  } else {
    const bin = tsProtoGlobalThis.atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; ++i) {
      arr[i] = bin.charCodeAt(i);
    }
    return arr;
  }
}

function base64FromBytes(arr: Uint8Array): string {
  if (tsProtoGlobalThis.Buffer) {
    return tsProtoGlobalThis.Buffer.from(arr).toString("base64");
  } else {
    const bin: string[] = [];
    arr.forEach((byte) => {
      bin.push(String.fromCharCode(byte));
    });
    return tsProtoGlobalThis.btoa(bin.join(""));
  }
}

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin ? T
  : T extends Array<infer U> ? Array<DeepPartial<U>> : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
  : T extends { $case: string } ? { [K in keyof Omit<T, "$case">]?: DeepPartial<T[K]> } & { $case: T["$case"] }
  : T extends {} ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

function toTimestamp(date: Date): Timestamp {
  const seconds = date.getTime() / 1_000;
  const nanos = (date.getTime() % 1_000) * 1_000_000;
  return { seconds, nanos };
}

function fromTimestamp(t: Timestamp): Date {
  let millis = t.seconds * 1_000;
  millis += t.nanos / 1_000_000;
  return new Date(millis);
}

function fromJsonTimestamp(o: any): Date {
  if (o instanceof Date) {
    return o;
  } else if (typeof o === "string") {
    return new Date(o);
  } else {
    return fromTimestamp(Timestamp.fromJSON(o));
  }
}

function longToNumber(long: Long): number {
  if (long.gt(Number.MAX_SAFE_INTEGER)) {
    throw new tsProtoGlobalThis.Error("Value is larger than Number.MAX_SAFE_INTEGER");
  }
  return long.toNumber();
}

if (_m0.util.Long !== Long) {
  _m0.util.Long = Long as any;
  _m0.configure();
}

function isObject(value: any): boolean {
  return typeof value === "object" && value !== null;
}

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
