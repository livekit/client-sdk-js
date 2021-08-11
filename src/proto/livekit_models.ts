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

export interface Room {
  sid: string;
  name: string;
  emptyTimeout: number;
  maxParticipants: number;
  creationTime: number;
  turnPassword: string;
  enabledCodecs: Codec[];
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
  /** timestamp when participant joined room */
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
}

/** old DataTrack message */
export interface DataMessage {
  text: string | undefined;
  binary: Uint8Array | undefined;
}

export interface RecordingTemplate {
  layout: string;
  wsUrl: string;
  /** either token or room name required */
  token: string;
  roomName: string;
}

export interface RecordingS3Output {
  bucket: string;
  key: string;
  /** optional */
  accessKey: string;
  secret: string;
}

export interface RecordingOptions {
  /** 720p30, 720p60, 1080p30, or 1080p60 */
  preset: string;
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  depth: number;
  framerate: number;
  audioBitrate: number;
  audioFrequency: number;
  videoBitrate: number;
}

const baseRoom: object = {
  sid: "",
  name: "",
  emptyTimeout: 0,
  maxParticipants: 0,
  creationTime: 0,
  turnPassword: "",
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
    return obj;
  },

  fromPartial(object: DeepPartial<Room>): Room {
    const message = { ...baseRoom } as Room;
    message.enabledCodecs = [];
    if (object.sid !== undefined && object.sid !== null) {
      message.sid = object.sid;
    } else {
      message.sid = "";
    }
    if (object.name !== undefined && object.name !== null) {
      message.name = object.name;
    } else {
      message.name = "";
    }
    if (object.emptyTimeout !== undefined && object.emptyTimeout !== null) {
      message.emptyTimeout = object.emptyTimeout;
    } else {
      message.emptyTimeout = 0;
    }
    if (
      object.maxParticipants !== undefined &&
      object.maxParticipants !== null
    ) {
      message.maxParticipants = object.maxParticipants;
    } else {
      message.maxParticipants = 0;
    }
    if (object.creationTime !== undefined && object.creationTime !== null) {
      message.creationTime = object.creationTime;
    } else {
      message.creationTime = 0;
    }
    if (object.turnPassword !== undefined && object.turnPassword !== null) {
      message.turnPassword = object.turnPassword;
    } else {
      message.turnPassword = "";
    }
    if (object.enabledCodecs !== undefined && object.enabledCodecs !== null) {
      for (const e of object.enabledCodecs) {
        message.enabledCodecs.push(Codec.fromPartial(e));
      }
    }
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
    if (object.mime !== undefined && object.mime !== null) {
      message.mime = object.mime;
    } else {
      message.mime = "";
    }
    if (object.fmtpLine !== undefined && object.fmtpLine !== null) {
      message.fmtpLine = object.fmtpLine;
    } else {
      message.fmtpLine = "";
    }
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
    message.tracks = [];
    if (object.sid !== undefined && object.sid !== null) {
      message.sid = object.sid;
    } else {
      message.sid = "";
    }
    if (object.identity !== undefined && object.identity !== null) {
      message.identity = object.identity;
    } else {
      message.identity = "";
    }
    if (object.state !== undefined && object.state !== null) {
      message.state = object.state;
    } else {
      message.state = 0;
    }
    if (object.tracks !== undefined && object.tracks !== null) {
      for (const e of object.tracks) {
        message.tracks.push(TrackInfo.fromPartial(e));
      }
    }
    if (object.metadata !== undefined && object.metadata !== null) {
      message.metadata = object.metadata;
    } else {
      message.metadata = "";
    }
    if (object.joinedAt !== undefined && object.joinedAt !== null) {
      message.joinedAt = object.joinedAt;
    } else {
      message.joinedAt = 0;
    }
    if (object.hidden !== undefined && object.hidden !== null) {
      message.hidden = object.hidden;
    } else {
      message.hidden = false;
    }
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
    return obj;
  },

  fromPartial(object: DeepPartial<TrackInfo>): TrackInfo {
    const message = { ...baseTrackInfo } as TrackInfo;
    if (object.sid !== undefined && object.sid !== null) {
      message.sid = object.sid;
    } else {
      message.sid = "";
    }
    if (object.type !== undefined && object.type !== null) {
      message.type = object.type;
    } else {
      message.type = 0;
    }
    if (object.name !== undefined && object.name !== null) {
      message.name = object.name;
    } else {
      message.name = "";
    }
    if (object.muted !== undefined && object.muted !== null) {
      message.muted = object.muted;
    } else {
      message.muted = false;
    }
    if (object.width !== undefined && object.width !== null) {
      message.width = object.width;
    } else {
      message.width = 0;
    }
    if (object.height !== undefined && object.height !== null) {
      message.height = object.height;
    } else {
      message.height = 0;
    }
    if (object.simulcast !== undefined && object.simulcast !== null) {
      message.simulcast = object.simulcast;
    } else {
      message.simulcast = false;
    }
    return message;
  },
};

const baseDataMessage: object = {};

export const DataMessage = {
  encode(
    message: DataMessage,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.text !== undefined) {
      writer.uint32(10).string(message.text);
    }
    if (message.binary !== undefined) {
      writer.uint32(18).bytes(message.binary);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): DataMessage {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseDataMessage } as DataMessage;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.text = reader.string();
          break;
        case 2:
          message.binary = reader.bytes();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): DataMessage {
    const message = { ...baseDataMessage } as DataMessage;
    if (object.text !== undefined && object.text !== null) {
      message.text = String(object.text);
    } else {
      message.text = undefined;
    }
    if (object.binary !== undefined && object.binary !== null) {
      message.binary = bytesFromBase64(object.binary);
    }
    return message;
  },

  toJSON(message: DataMessage): unknown {
    const obj: any = {};
    message.text !== undefined && (obj.text = message.text);
    message.binary !== undefined &&
      (obj.binary =
        message.binary !== undefined
          ? base64FromBytes(message.binary)
          : undefined);
    return obj;
  },

  fromPartial(object: DeepPartial<DataMessage>): DataMessage {
    const message = { ...baseDataMessage } as DataMessage;
    if (object.text !== undefined && object.text !== null) {
      message.text = object.text;
    } else {
      message.text = undefined;
    }
    if (object.binary !== undefined && object.binary !== null) {
      message.binary = object.binary;
    } else {
      message.binary = undefined;
    }
    return message;
  },
};

const baseRecordingTemplate: object = {
  layout: "",
  wsUrl: "",
  token: "",
  roomName: "",
};

export const RecordingTemplate = {
  encode(
    message: RecordingTemplate,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.layout !== "") {
      writer.uint32(10).string(message.layout);
    }
    if (message.wsUrl !== "") {
      writer.uint32(18).string(message.wsUrl);
    }
    if (message.token !== "") {
      writer.uint32(26).string(message.token);
    }
    if (message.roomName !== "") {
      writer.uint32(34).string(message.roomName);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RecordingTemplate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseRecordingTemplate } as RecordingTemplate;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.layout = reader.string();
          break;
        case 2:
          message.wsUrl = reader.string();
          break;
        case 3:
          message.token = reader.string();
          break;
        case 4:
          message.roomName = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): RecordingTemplate {
    const message = { ...baseRecordingTemplate } as RecordingTemplate;
    if (object.layout !== undefined && object.layout !== null) {
      message.layout = String(object.layout);
    } else {
      message.layout = "";
    }
    if (object.wsUrl !== undefined && object.wsUrl !== null) {
      message.wsUrl = String(object.wsUrl);
    } else {
      message.wsUrl = "";
    }
    if (object.token !== undefined && object.token !== null) {
      message.token = String(object.token);
    } else {
      message.token = "";
    }
    if (object.roomName !== undefined && object.roomName !== null) {
      message.roomName = String(object.roomName);
    } else {
      message.roomName = "";
    }
    return message;
  },

  toJSON(message: RecordingTemplate): unknown {
    const obj: any = {};
    message.layout !== undefined && (obj.layout = message.layout);
    message.wsUrl !== undefined && (obj.wsUrl = message.wsUrl);
    message.token !== undefined && (obj.token = message.token);
    message.roomName !== undefined && (obj.roomName = message.roomName);
    return obj;
  },

  fromPartial(object: DeepPartial<RecordingTemplate>): RecordingTemplate {
    const message = { ...baseRecordingTemplate } as RecordingTemplate;
    if (object.layout !== undefined && object.layout !== null) {
      message.layout = object.layout;
    } else {
      message.layout = "";
    }
    if (object.wsUrl !== undefined && object.wsUrl !== null) {
      message.wsUrl = object.wsUrl;
    } else {
      message.wsUrl = "";
    }
    if (object.token !== undefined && object.token !== null) {
      message.token = object.token;
    } else {
      message.token = "";
    }
    if (object.roomName !== undefined && object.roomName !== null) {
      message.roomName = object.roomName;
    } else {
      message.roomName = "";
    }
    return message;
  },
};

const baseRecordingS3Output: object = {
  bucket: "",
  key: "",
  accessKey: "",
  secret: "",
};

export const RecordingS3Output = {
  encode(
    message: RecordingS3Output,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.bucket !== "") {
      writer.uint32(10).string(message.bucket);
    }
    if (message.key !== "") {
      writer.uint32(18).string(message.key);
    }
    if (message.accessKey !== "") {
      writer.uint32(26).string(message.accessKey);
    }
    if (message.secret !== "") {
      writer.uint32(34).string(message.secret);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RecordingS3Output {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseRecordingS3Output } as RecordingS3Output;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.bucket = reader.string();
          break;
        case 2:
          message.key = reader.string();
          break;
        case 3:
          message.accessKey = reader.string();
          break;
        case 4:
          message.secret = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): RecordingS3Output {
    const message = { ...baseRecordingS3Output } as RecordingS3Output;
    if (object.bucket !== undefined && object.bucket !== null) {
      message.bucket = String(object.bucket);
    } else {
      message.bucket = "";
    }
    if (object.key !== undefined && object.key !== null) {
      message.key = String(object.key);
    } else {
      message.key = "";
    }
    if (object.accessKey !== undefined && object.accessKey !== null) {
      message.accessKey = String(object.accessKey);
    } else {
      message.accessKey = "";
    }
    if (object.secret !== undefined && object.secret !== null) {
      message.secret = String(object.secret);
    } else {
      message.secret = "";
    }
    return message;
  },

  toJSON(message: RecordingS3Output): unknown {
    const obj: any = {};
    message.bucket !== undefined && (obj.bucket = message.bucket);
    message.key !== undefined && (obj.key = message.key);
    message.accessKey !== undefined && (obj.accessKey = message.accessKey);
    message.secret !== undefined && (obj.secret = message.secret);
    return obj;
  },

  fromPartial(object: DeepPartial<RecordingS3Output>): RecordingS3Output {
    const message = { ...baseRecordingS3Output } as RecordingS3Output;
    if (object.bucket !== undefined && object.bucket !== null) {
      message.bucket = object.bucket;
    } else {
      message.bucket = "";
    }
    if (object.key !== undefined && object.key !== null) {
      message.key = object.key;
    } else {
      message.key = "";
    }
    if (object.accessKey !== undefined && object.accessKey !== null) {
      message.accessKey = object.accessKey;
    } else {
      message.accessKey = "";
    }
    if (object.secret !== undefined && object.secret !== null) {
      message.secret = object.secret;
    } else {
      message.secret = "";
    }
    return message;
  },
};

const baseRecordingOptions: object = {
  preset: "",
  inputWidth: 0,
  inputHeight: 0,
  outputWidth: 0,
  outputHeight: 0,
  depth: 0,
  framerate: 0,
  audioBitrate: 0,
  audioFrequency: 0,
  videoBitrate: 0,
};

export const RecordingOptions = {
  encode(
    message: RecordingOptions,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.preset !== "") {
      writer.uint32(10).string(message.preset);
    }
    if (message.inputWidth !== 0) {
      writer.uint32(16).int32(message.inputWidth);
    }
    if (message.inputHeight !== 0) {
      writer.uint32(24).int32(message.inputHeight);
    }
    if (message.outputWidth !== 0) {
      writer.uint32(32).int32(message.outputWidth);
    }
    if (message.outputHeight !== 0) {
      writer.uint32(40).int32(message.outputHeight);
    }
    if (message.depth !== 0) {
      writer.uint32(48).int32(message.depth);
    }
    if (message.framerate !== 0) {
      writer.uint32(56).int32(message.framerate);
    }
    if (message.audioBitrate !== 0) {
      writer.uint32(64).int32(message.audioBitrate);
    }
    if (message.audioFrequency !== 0) {
      writer.uint32(72).int32(message.audioFrequency);
    }
    if (message.videoBitrate !== 0) {
      writer.uint32(80).int32(message.videoBitrate);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RecordingOptions {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseRecordingOptions } as RecordingOptions;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.preset = reader.string();
          break;
        case 2:
          message.inputWidth = reader.int32();
          break;
        case 3:
          message.inputHeight = reader.int32();
          break;
        case 4:
          message.outputWidth = reader.int32();
          break;
        case 5:
          message.outputHeight = reader.int32();
          break;
        case 6:
          message.depth = reader.int32();
          break;
        case 7:
          message.framerate = reader.int32();
          break;
        case 8:
          message.audioBitrate = reader.int32();
          break;
        case 9:
          message.audioFrequency = reader.int32();
          break;
        case 10:
          message.videoBitrate = reader.int32();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): RecordingOptions {
    const message = { ...baseRecordingOptions } as RecordingOptions;
    if (object.preset !== undefined && object.preset !== null) {
      message.preset = String(object.preset);
    } else {
      message.preset = "";
    }
    if (object.inputWidth !== undefined && object.inputWidth !== null) {
      message.inputWidth = Number(object.inputWidth);
    } else {
      message.inputWidth = 0;
    }
    if (object.inputHeight !== undefined && object.inputHeight !== null) {
      message.inputHeight = Number(object.inputHeight);
    } else {
      message.inputHeight = 0;
    }
    if (object.outputWidth !== undefined && object.outputWidth !== null) {
      message.outputWidth = Number(object.outputWidth);
    } else {
      message.outputWidth = 0;
    }
    if (object.outputHeight !== undefined && object.outputHeight !== null) {
      message.outputHeight = Number(object.outputHeight);
    } else {
      message.outputHeight = 0;
    }
    if (object.depth !== undefined && object.depth !== null) {
      message.depth = Number(object.depth);
    } else {
      message.depth = 0;
    }
    if (object.framerate !== undefined && object.framerate !== null) {
      message.framerate = Number(object.framerate);
    } else {
      message.framerate = 0;
    }
    if (object.audioBitrate !== undefined && object.audioBitrate !== null) {
      message.audioBitrate = Number(object.audioBitrate);
    } else {
      message.audioBitrate = 0;
    }
    if (object.audioFrequency !== undefined && object.audioFrequency !== null) {
      message.audioFrequency = Number(object.audioFrequency);
    } else {
      message.audioFrequency = 0;
    }
    if (object.videoBitrate !== undefined && object.videoBitrate !== null) {
      message.videoBitrate = Number(object.videoBitrate);
    } else {
      message.videoBitrate = 0;
    }
    return message;
  },

  toJSON(message: RecordingOptions): unknown {
    const obj: any = {};
    message.preset !== undefined && (obj.preset = message.preset);
    message.inputWidth !== undefined && (obj.inputWidth = message.inputWidth);
    message.inputHeight !== undefined &&
      (obj.inputHeight = message.inputHeight);
    message.outputWidth !== undefined &&
      (obj.outputWidth = message.outputWidth);
    message.outputHeight !== undefined &&
      (obj.outputHeight = message.outputHeight);
    message.depth !== undefined && (obj.depth = message.depth);
    message.framerate !== undefined && (obj.framerate = message.framerate);
    message.audioBitrate !== undefined &&
      (obj.audioBitrate = message.audioBitrate);
    message.audioFrequency !== undefined &&
      (obj.audioFrequency = message.audioFrequency);
    message.videoBitrate !== undefined &&
      (obj.videoBitrate = message.videoBitrate);
    return obj;
  },

  fromPartial(object: DeepPartial<RecordingOptions>): RecordingOptions {
    const message = { ...baseRecordingOptions } as RecordingOptions;
    if (object.preset !== undefined && object.preset !== null) {
      message.preset = object.preset;
    } else {
      message.preset = "";
    }
    if (object.inputWidth !== undefined && object.inputWidth !== null) {
      message.inputWidth = object.inputWidth;
    } else {
      message.inputWidth = 0;
    }
    if (object.inputHeight !== undefined && object.inputHeight !== null) {
      message.inputHeight = object.inputHeight;
    } else {
      message.inputHeight = 0;
    }
    if (object.outputWidth !== undefined && object.outputWidth !== null) {
      message.outputWidth = object.outputWidth;
    } else {
      message.outputWidth = 0;
    }
    if (object.outputHeight !== undefined && object.outputHeight !== null) {
      message.outputHeight = object.outputHeight;
    } else {
      message.outputHeight = 0;
    }
    if (object.depth !== undefined && object.depth !== null) {
      message.depth = object.depth;
    } else {
      message.depth = 0;
    }
    if (object.framerate !== undefined && object.framerate !== null) {
      message.framerate = object.framerate;
    } else {
      message.framerate = 0;
    }
    if (object.audioBitrate !== undefined && object.audioBitrate !== null) {
      message.audioBitrate = object.audioBitrate;
    } else {
      message.audioBitrate = 0;
    }
    if (object.audioFrequency !== undefined && object.audioFrequency !== null) {
      message.audioFrequency = object.audioFrequency;
    } else {
      message.audioFrequency = 0;
    }
    if (object.videoBitrate !== undefined && object.videoBitrate !== null) {
      message.videoBitrate = object.videoBitrate;
    } else {
      message.videoBitrate = 0;
    }
    return message;
  },
};

declare var self: any | undefined;
declare var window: any | undefined;
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
  for (let i = 0; i < arr.byteLength; ++i) {
    bin.push(String.fromCharCode(arr[i]));
  }
  return btoa(bin.join(""));
}

type Builtin = Date | Function | Uint8Array | string | number | undefined;
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
