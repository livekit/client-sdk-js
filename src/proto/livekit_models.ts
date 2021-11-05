/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";

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
    default:
      return "UNKNOWN";
  }
}

export enum TrackSource {
  UNKNOWN = 0,
  CAMERA = 1,
  MICROPHONE = 2,
  SCREEN_SHARE = 3,
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
    default:
      return "UNKNOWN";
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
    default:
      return "UNKNOWN";
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
}

export interface Codec {
  mime: string;
  fmtpLine: string;
}

export interface ParticipantInfo {
  sid: string;
  identity: string;
  state: ParticipantInfo_State;
  tracks: TrackInfo[];
  metadata: string;
  /** timestamp when participant joined room, in seconds */
  joinedAt: number;
  /** hidden participant (used for recording) */
  hidden: boolean;
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

export function participantInfo_StateFromJSON(
  object: any
): ParticipantInfo_State {
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

export function participantInfo_StateToJSON(
  object: ParticipantInfo_State
): string {
  switch (object) {
    case ParticipantInfo_State.JOINING:
      return "JOINING";
    case ParticipantInfo_State.JOINED:
      return "JOINED";
    case ParticipantInfo_State.ACTIVE:
      return "ACTIVE";
    case ParticipantInfo_State.DISCONNECTED:
      return "DISCONNECTED";
    default:
      return "UNKNOWN";
  }
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
}

/** new DataPacket API */
export interface DataPacket {
  kind: DataPacket_Kind;
  user?: UserPacket | undefined;
  speaker?: ActiveSpeakerUpdate | undefined;
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
    default:
      return "UNKNOWN";
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

const baseRoom: object = {
  sid: "",
  name: "",
  emptyTimeout: 0,
  maxParticipants: 0,
  creationTime: 0,
  turnPassword: "",
  metadata: "",
  numParticipants: 0,
};

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
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Room {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseRoom } as Room;
    message.enabledCodecs = [];
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
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): Room {
    const message = { ...baseRoom } as Room;
    message.enabledCodecs = [];
    if (object.sid !== undefined && object.sid !== null) {
      message.sid = String(object.sid);
    } else {
      message.sid = "";
    }
    if (object.name !== undefined && object.name !== null) {
      message.name = String(object.name);
    } else {
      message.name = "";
    }
    if (object.emptyTimeout !== undefined && object.emptyTimeout !== null) {
      message.emptyTimeout = Number(object.emptyTimeout);
    } else {
      message.emptyTimeout = 0;
    }
    if (
      object.maxParticipants !== undefined &&
      object.maxParticipants !== null
    ) {
      message.maxParticipants = Number(object.maxParticipants);
    } else {
      message.maxParticipants = 0;
    }
    if (object.creationTime !== undefined && object.creationTime !== null) {
      message.creationTime = Number(object.creationTime);
    } else {
      message.creationTime = 0;
    }
    if (object.turnPassword !== undefined && object.turnPassword !== null) {
      message.turnPassword = String(object.turnPassword);
    } else {
      message.turnPassword = "";
    }
    if (object.enabledCodecs !== undefined && object.enabledCodecs !== null) {
      for (const e of object.enabledCodecs) {
        message.enabledCodecs.push(Codec.fromJSON(e));
      }
    }
    if (object.metadata !== undefined && object.metadata !== null) {
      message.metadata = String(object.metadata);
    } else {
      message.metadata = "";
    }
    if (
      object.numParticipants !== undefined &&
      object.numParticipants !== null
    ) {
      message.numParticipants = Number(object.numParticipants);
    } else {
      message.numParticipants = 0;
    }
    return message;
  },

  toJSON(message: Room): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.name !== undefined && (obj.name = message.name);
    message.emptyTimeout !== undefined &&
      (obj.emptyTimeout = message.emptyTimeout);
    message.maxParticipants !== undefined &&
      (obj.maxParticipants = message.maxParticipants);
    message.creationTime !== undefined &&
      (obj.creationTime = message.creationTime);
    message.turnPassword !== undefined &&
      (obj.turnPassword = message.turnPassword);
    if (message.enabledCodecs) {
      obj.enabledCodecs = message.enabledCodecs.map((e) =>
        e ? Codec.toJSON(e) : undefined
      );
    } else {
      obj.enabledCodecs = [];
    }
    message.metadata !== undefined && (obj.metadata = message.metadata);
    message.numParticipants !== undefined &&
      (obj.numParticipants = message.numParticipants);
    return obj;
  },

  fromPartial(object: DeepPartial<Room>): Room {
    const message = { ...baseRoom } as Room;
    message.sid = object.sid ?? "";
    message.name = object.name ?? "";
    message.emptyTimeout = object.emptyTimeout ?? 0;
    message.maxParticipants = object.maxParticipants ?? 0;
    message.creationTime = object.creationTime ?? 0;
    message.turnPassword = object.turnPassword ?? "";
    message.enabledCodecs = [];
    if (object.enabledCodecs !== undefined && object.enabledCodecs !== null) {
      for (const e of object.enabledCodecs) {
        message.enabledCodecs.push(Codec.fromPartial(e));
      }
    }
    message.metadata = object.metadata ?? "";
    message.numParticipants = object.numParticipants ?? 0;
    return message;
  },
};

const baseCodec: object = { mime: "", fmtpLine: "" };

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
    const message = { ...baseCodec } as Codec;
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
    const message = { ...baseCodec } as Codec;
    if (object.mime !== undefined && object.mime !== null) {
      message.mime = String(object.mime);
    } else {
      message.mime = "";
    }
    if (object.fmtpLine !== undefined && object.fmtpLine !== null) {
      message.fmtpLine = String(object.fmtpLine);
    } else {
      message.fmtpLine = "";
    }
    return message;
  },

  toJSON(message: Codec): unknown {
    const obj: any = {};
    message.mime !== undefined && (obj.mime = message.mime);
    message.fmtpLine !== undefined && (obj.fmtpLine = message.fmtpLine);
    return obj;
  },

  fromPartial(object: DeepPartial<Codec>): Codec {
    const message = { ...baseCodec } as Codec;
    message.mime = object.mime ?? "";
    message.fmtpLine = object.fmtpLine ?? "";
    return message;
  },
};

const baseParticipantInfo: object = {
  sid: "",
  identity: "",
  state: 0,
  metadata: "",
  joinedAt: 0,
  hidden: false,
};

export const ParticipantInfo = {
  encode(
    message: ParticipantInfo,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
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
    if (message.hidden === true) {
      writer.uint32(56).bool(message.hidden);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ParticipantInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseParticipantInfo } as ParticipantInfo;
    message.tracks = [];
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
        case 7:
          message.hidden = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ParticipantInfo {
    const message = { ...baseParticipantInfo } as ParticipantInfo;
    message.tracks = [];
    if (object.sid !== undefined && object.sid !== null) {
      message.sid = String(object.sid);
    } else {
      message.sid = "";
    }
    if (object.identity !== undefined && object.identity !== null) {
      message.identity = String(object.identity);
    } else {
      message.identity = "";
    }
    if (object.state !== undefined && object.state !== null) {
      message.state = participantInfo_StateFromJSON(object.state);
    } else {
      message.state = 0;
    }
    if (object.tracks !== undefined && object.tracks !== null) {
      for (const e of object.tracks) {
        message.tracks.push(TrackInfo.fromJSON(e));
      }
    }
    if (object.metadata !== undefined && object.metadata !== null) {
      message.metadata = String(object.metadata);
    } else {
      message.metadata = "";
    }
    if (object.joinedAt !== undefined && object.joinedAt !== null) {
      message.joinedAt = Number(object.joinedAt);
    } else {
      message.joinedAt = 0;
    }
    if (object.hidden !== undefined && object.hidden !== null) {
      message.hidden = Boolean(object.hidden);
    } else {
      message.hidden = false;
    }
    return message;
  },

  toJSON(message: ParticipantInfo): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.identity !== undefined && (obj.identity = message.identity);
    message.state !== undefined &&
      (obj.state = participantInfo_StateToJSON(message.state));
    if (message.tracks) {
      obj.tracks = message.tracks.map((e) =>
        e ? TrackInfo.toJSON(e) : undefined
      );
    } else {
      obj.tracks = [];
    }
    message.metadata !== undefined && (obj.metadata = message.metadata);
    message.joinedAt !== undefined && (obj.joinedAt = message.joinedAt);
    message.hidden !== undefined && (obj.hidden = message.hidden);
    return obj;
  },

  fromPartial(object: DeepPartial<ParticipantInfo>): ParticipantInfo {
    const message = { ...baseParticipantInfo } as ParticipantInfo;
    message.sid = object.sid ?? "";
    message.identity = object.identity ?? "";
    message.state = object.state ?? 0;
    message.tracks = [];
    if (object.tracks !== undefined && object.tracks !== null) {
      for (const e of object.tracks) {
        message.tracks.push(TrackInfo.fromPartial(e));
      }
    }
    message.metadata = object.metadata ?? "";
    message.joinedAt = object.joinedAt ?? 0;
    message.hidden = object.hidden ?? false;
    return message;
  },
};

const baseTrackInfo: object = {
  sid: "",
  type: 0,
  name: "",
  muted: false,
  width: 0,
  height: 0,
  simulcast: false,
  disableDtx: false,
  source: 0,
};

export const TrackInfo = {
  encode(
    message: TrackInfo,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
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
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TrackInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseTrackInfo } as TrackInfo;
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
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): TrackInfo {
    const message = { ...baseTrackInfo } as TrackInfo;
    if (object.sid !== undefined && object.sid !== null) {
      message.sid = String(object.sid);
    } else {
      message.sid = "";
    }
    if (object.type !== undefined && object.type !== null) {
      message.type = trackTypeFromJSON(object.type);
    } else {
      message.type = 0;
    }
    if (object.name !== undefined && object.name !== null) {
      message.name = String(object.name);
    } else {
      message.name = "";
    }
    if (object.muted !== undefined && object.muted !== null) {
      message.muted = Boolean(object.muted);
    } else {
      message.muted = false;
    }
    if (object.width !== undefined && object.width !== null) {
      message.width = Number(object.width);
    } else {
      message.width = 0;
    }
    if (object.height !== undefined && object.height !== null) {
      message.height = Number(object.height);
    } else {
      message.height = 0;
    }
    if (object.simulcast !== undefined && object.simulcast !== null) {
      message.simulcast = Boolean(object.simulcast);
    } else {
      message.simulcast = false;
    }
    if (object.disableDtx !== undefined && object.disableDtx !== null) {
      message.disableDtx = Boolean(object.disableDtx);
    } else {
      message.disableDtx = false;
    }
    if (object.source !== undefined && object.source !== null) {
      message.source = trackSourceFromJSON(object.source);
    } else {
      message.source = 0;
    }
    return message;
  },

  toJSON(message: TrackInfo): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.type !== undefined && (obj.type = trackTypeToJSON(message.type));
    message.name !== undefined && (obj.name = message.name);
    message.muted !== undefined && (obj.muted = message.muted);
    message.width !== undefined && (obj.width = message.width);
    message.height !== undefined && (obj.height = message.height);
    message.simulcast !== undefined && (obj.simulcast = message.simulcast);
    message.disableDtx !== undefined && (obj.disableDtx = message.disableDtx);
    message.source !== undefined &&
      (obj.source = trackSourceToJSON(message.source));
    return obj;
  },

  fromPartial(object: DeepPartial<TrackInfo>): TrackInfo {
    const message = { ...baseTrackInfo } as TrackInfo;
    message.sid = object.sid ?? "";
    message.type = object.type ?? 0;
    message.name = object.name ?? "";
    message.muted = object.muted ?? false;
    message.width = object.width ?? 0;
    message.height = object.height ?? 0;
    message.simulcast = object.simulcast ?? false;
    message.disableDtx = object.disableDtx ?? false;
    message.source = object.source ?? 0;
    return message;
  },
};

const baseDataPacket: object = { kind: 0 };

export const DataPacket = {
  encode(
    message: DataPacket,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.kind !== 0) {
      writer.uint32(8).int32(message.kind);
    }
    if (message.user !== undefined) {
      UserPacket.encode(message.user, writer.uint32(18).fork()).ldelim();
    }
    if (message.speaker !== undefined) {
      ActiveSpeakerUpdate.encode(
        message.speaker,
        writer.uint32(26).fork()
      ).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): DataPacket {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseDataPacket } as DataPacket;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.kind = reader.int32() as any;
          break;
        case 2:
          message.user = UserPacket.decode(reader, reader.uint32());
          break;
        case 3:
          message.speaker = ActiveSpeakerUpdate.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): DataPacket {
    const message = { ...baseDataPacket } as DataPacket;
    if (object.kind !== undefined && object.kind !== null) {
      message.kind = dataPacket_KindFromJSON(object.kind);
    } else {
      message.kind = 0;
    }
    if (object.user !== undefined && object.user !== null) {
      message.user = UserPacket.fromJSON(object.user);
    } else {
      message.user = undefined;
    }
    if (object.speaker !== undefined && object.speaker !== null) {
      message.speaker = ActiveSpeakerUpdate.fromJSON(object.speaker);
    } else {
      message.speaker = undefined;
    }
    return message;
  },

  toJSON(message: DataPacket): unknown {
    const obj: any = {};
    message.kind !== undefined &&
      (obj.kind = dataPacket_KindToJSON(message.kind));
    message.user !== undefined &&
      (obj.user = message.user ? UserPacket.toJSON(message.user) : undefined);
    message.speaker !== undefined &&
      (obj.speaker = message.speaker
        ? ActiveSpeakerUpdate.toJSON(message.speaker)
        : undefined);
    return obj;
  },

  fromPartial(object: DeepPartial<DataPacket>): DataPacket {
    const message = { ...baseDataPacket } as DataPacket;
    message.kind = object.kind ?? 0;
    if (object.user !== undefined && object.user !== null) {
      message.user = UserPacket.fromPartial(object.user);
    } else {
      message.user = undefined;
    }
    if (object.speaker !== undefined && object.speaker !== null) {
      message.speaker = ActiveSpeakerUpdate.fromPartial(object.speaker);
    } else {
      message.speaker = undefined;
    }
    return message;
  },
};

const baseActiveSpeakerUpdate: object = {};

export const ActiveSpeakerUpdate = {
  encode(
    message: ActiveSpeakerUpdate,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    for (const v of message.speakers) {
      SpeakerInfo.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ActiveSpeakerUpdate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseActiveSpeakerUpdate } as ActiveSpeakerUpdate;
    message.speakers = [];
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
    const message = { ...baseActiveSpeakerUpdate } as ActiveSpeakerUpdate;
    message.speakers = [];
    if (object.speakers !== undefined && object.speakers !== null) {
      for (const e of object.speakers) {
        message.speakers.push(SpeakerInfo.fromJSON(e));
      }
    }
    return message;
  },

  toJSON(message: ActiveSpeakerUpdate): unknown {
    const obj: any = {};
    if (message.speakers) {
      obj.speakers = message.speakers.map((e) =>
        e ? SpeakerInfo.toJSON(e) : undefined
      );
    } else {
      obj.speakers = [];
    }
    return obj;
  },

  fromPartial(object: DeepPartial<ActiveSpeakerUpdate>): ActiveSpeakerUpdate {
    const message = { ...baseActiveSpeakerUpdate } as ActiveSpeakerUpdate;
    message.speakers = [];
    if (object.speakers !== undefined && object.speakers !== null) {
      for (const e of object.speakers) {
        message.speakers.push(SpeakerInfo.fromPartial(e));
      }
    }
    return message;
  },
};

const baseSpeakerInfo: object = { sid: "", level: 0, active: false };

export const SpeakerInfo = {
  encode(
    message: SpeakerInfo,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
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
    const message = { ...baseSpeakerInfo } as SpeakerInfo;
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
    const message = { ...baseSpeakerInfo } as SpeakerInfo;
    if (object.sid !== undefined && object.sid !== null) {
      message.sid = String(object.sid);
    } else {
      message.sid = "";
    }
    if (object.level !== undefined && object.level !== null) {
      message.level = Number(object.level);
    } else {
      message.level = 0;
    }
    if (object.active !== undefined && object.active !== null) {
      message.active = Boolean(object.active);
    } else {
      message.active = false;
    }
    return message;
  },

  toJSON(message: SpeakerInfo): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.level !== undefined && (obj.level = message.level);
    message.active !== undefined && (obj.active = message.active);
    return obj;
  },

  fromPartial(object: DeepPartial<SpeakerInfo>): SpeakerInfo {
    const message = { ...baseSpeakerInfo } as SpeakerInfo;
    message.sid = object.sid ?? "";
    message.level = object.level ?? 0;
    message.active = object.active ?? false;
    return message;
  },
};

const baseUserPacket: object = { participantSid: "", destinationSids: "" };

export const UserPacket = {
  encode(
    message: UserPacket,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
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
    const message = { ...baseUserPacket } as UserPacket;
    message.destinationSids = [];
    message.payload = new Uint8Array();
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
    const message = { ...baseUserPacket } as UserPacket;
    message.destinationSids = [];
    message.payload = new Uint8Array();
    if (object.participantSid !== undefined && object.participantSid !== null) {
      message.participantSid = String(object.participantSid);
    } else {
      message.participantSid = "";
    }
    if (object.payload !== undefined && object.payload !== null) {
      message.payload = bytesFromBase64(object.payload);
    }
    if (
      object.destinationSids !== undefined &&
      object.destinationSids !== null
    ) {
      for (const e of object.destinationSids) {
        message.destinationSids.push(String(e));
      }
    }
    return message;
  },

  toJSON(message: UserPacket): unknown {
    const obj: any = {};
    message.participantSid !== undefined &&
      (obj.participantSid = message.participantSid);
    message.payload !== undefined &&
      (obj.payload = base64FromBytes(
        message.payload !== undefined ? message.payload : new Uint8Array()
      ));
    if (message.destinationSids) {
      obj.destinationSids = message.destinationSids.map((e) => e);
    } else {
      obj.destinationSids = [];
    }
    return obj;
  },

  fromPartial(object: DeepPartial<UserPacket>): UserPacket {
    const message = { ...baseUserPacket } as UserPacket;
    message.participantSid = object.participantSid ?? "";
    message.payload = object.payload ?? new Uint8Array();
    message.destinationSids = [];
    if (
      object.destinationSids !== undefined &&
      object.destinationSids !== null
    ) {
      for (const e of object.destinationSids) {
        message.destinationSids.push(e);
      }
    }
    return message;
  },
};

declare var self: any | undefined;
declare var window: any | undefined;
declare var global: any | undefined;
var globalThis: any = (() => {
  if (typeof globalThis !== "undefined") return globalThis;
  if (typeof self !== "undefined") return self;
  if (typeof window !== "undefined") return window;
  if (typeof global !== "undefined") return global;
  throw "Unable to locate global object";
})();

const atob: (b64: string) => string =
  globalThis.atob ||
  ((b64) => globalThis.Buffer.from(b64, "base64").toString("binary"));
function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; ++i) {
    arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

const btoa: (bin: string) => string =
  globalThis.btoa ||
  ((bin) => globalThis.Buffer.from(bin, "binary").toString("base64"));
function base64FromBytes(arr: Uint8Array): string {
  const bin: string[] = [];
  for (const byte of arr) {
    bin.push(String.fromCharCode(byte));
  }
  return btoa(bin.join(""));
}

type Builtin =
  | Date
  | Function
  | Uint8Array
  | string
  | number
  | boolean
  | undefined;
export type DeepPartial<T> = T extends Builtin
  ? T
  : T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U>
  ? ReadonlyArray<DeepPartial<U>>
  : T extends {}
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

function longToNumber(long: Long): number {
  if (long.gt(Number.MAX_SAFE_INTEGER)) {
    throw new globalThis.Error("Value is larger than Number.MAX_SAFE_INTEGER");
  }
  return long.toNumber();
}

if (_m0.util.Long !== Long) {
  _m0.util.Long = Long as any;
  _m0.configure();
}
