/* eslint-disable */
import * as Long from 'long';
import { Writer, Reader, util, configure } from 'protobufjs/minimal';


export interface Room {
  sid: string;
  name: string;
  emptyTimeout: number;
  maxParticipants: number;
  creationTime: number;
}

export interface ParticipantInfo {
  sid: string;
  name: string;
  state: ParticipantInfo_State;
  tracks: TrackInfo[];
}

export interface TrackInfo {
  sid: string;
  type: TrackType;
  name: string;
  muted: boolean;
}

export interface DataMessage {
  text: string | undefined;
  binary: Uint8Array | undefined;
}

const baseRoom: object = {
  sid: "",
  name: "",
  emptyTimeout: 0,
  maxParticipants: 0,
  creationTime: 0,
};

const baseParticipantInfo: object = {
  sid: "",
  name: "",
  state: 0,
};

const baseTrackInfo: object = {
  sid: "",
  type: 0,
  name: "",
  muted: false,
};

const baseDataMessage: object = {
};

function longToNumber(long: Long) {
  if (long.gt(Number.MAX_SAFE_INTEGER)) {
    throw new globalThis.Error("Value is larger than Number.MAX_SAFE_INTEGER");
  }
  return long.toNumber();
}

export const protobufPackage = 'livekit'

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

export enum ParticipantInfo_State {
  /** JOINING -  websocket' connected, but not offered yet
   */
  JOINING = 0,
  /** JOINED -  server received client offer
   */
  JOINED = 1,
  /** ACTIVE -  ICE connectivity established
   */
  ACTIVE = 2,
  /** DISCONNECTED -  WS disconnected
   */
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
    default:
      return "UNKNOWN";
  }
}

export const Room = {
  encode(message: Room, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.sid);
    writer.uint32(18).string(message.name);
    writer.uint32(24).uint32(message.emptyTimeout);
    writer.uint32(32).uint32(message.maxParticipants);
    writer.uint32(40).int64(message.creationTime);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): Room {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseRoom } as Room;
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
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): Room {
    const message = { ...baseRoom } as Room;
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
    if (object.maxParticipants !== undefined && object.maxParticipants !== null) {
      message.maxParticipants = Number(object.maxParticipants);
    } else {
      message.maxParticipants = 0;
    }
    if (object.creationTime !== undefined && object.creationTime !== null) {
      message.creationTime = Number(object.creationTime);
    } else {
      message.creationTime = 0;
    }
    return message;
  },
  fromPartial(object: DeepPartial<Room>): Room {
    const message = { ...baseRoom } as Room;
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
    if (object.maxParticipants !== undefined && object.maxParticipants !== null) {
      message.maxParticipants = object.maxParticipants;
    } else {
      message.maxParticipants = 0;
    }
    if (object.creationTime !== undefined && object.creationTime !== null) {
      message.creationTime = object.creationTime;
    } else {
      message.creationTime = 0;
    }
    return message;
  },
  toJSON(message: Room): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.name !== undefined && (obj.name = message.name);
    message.emptyTimeout !== undefined && (obj.emptyTimeout = message.emptyTimeout);
    message.maxParticipants !== undefined && (obj.maxParticipants = message.maxParticipants);
    message.creationTime !== undefined && (obj.creationTime = message.creationTime);
    return obj;
  },
};

export const ParticipantInfo = {
  encode(message: ParticipantInfo, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.sid);
    writer.uint32(18).string(message.name);
    writer.uint32(24).int32(message.state);
    for (const v of message.tracks) {
      TrackInfo.encode(v!, writer.uint32(34).fork()).ldelim();
    }
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): ParticipantInfo {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
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
          message.name = reader.string();
          break;
        case 3:
          message.state = reader.int32() as any;
          break;
        case 4:
          message.tracks.push(TrackInfo.decode(reader, reader.uint32()));
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
    if (object.name !== undefined && object.name !== null) {
      message.name = String(object.name);
    } else {
      message.name = "";
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
    return message;
  },
  fromPartial(object: DeepPartial<ParticipantInfo>): ParticipantInfo {
    const message = { ...baseParticipantInfo } as ParticipantInfo;
    message.tracks = [];
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
    return message;
  },
  toJSON(message: ParticipantInfo): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.name !== undefined && (obj.name = message.name);
    message.state !== undefined && (obj.state = participantInfo_StateToJSON(message.state));
    if (message.tracks) {
      obj.tracks = message.tracks.map(e => e ? TrackInfo.toJSON(e) : undefined);
    } else {
      obj.tracks = [];
    }
    return obj;
  },
};

export const TrackInfo = {
  encode(message: TrackInfo, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.sid);
    writer.uint32(16).int32(message.type);
    writer.uint32(26).string(message.name);
    writer.uint32(32).bool(message.muted);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): TrackInfo {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
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
    return message;
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
    return message;
  },
  toJSON(message: TrackInfo): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.type !== undefined && (obj.type = trackTypeToJSON(message.type));
    message.name !== undefined && (obj.name = message.name);
    message.muted !== undefined && (obj.muted = message.muted);
    return obj;
  },
};

export const DataMessage = {
  encode(message: DataMessage, writer: Writer = Writer.create()): Writer {
    if (message.text !== undefined) {
      writer.uint32(10).string(message.text);
    }
    if (message.binary !== undefined) {
      writer.uint32(18).bytes(message.binary);
    }
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): DataMessage {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
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
  toJSON(message: DataMessage): unknown {
    const obj: any = {};
    message.text !== undefined && (obj.text = message.text);
    message.binary !== undefined && (obj.binary = message.binary !== undefined ? base64FromBytes(message.binary) : undefined);
    return obj;
  },
};

if (util.Long !== Long as any) {
  util.Long = Long as any;
  configure();
}

interface WindowBase64 {
  atob(b64: string): string;
  btoa(bin: string): string;
}

const windowBase64 = (globalThis as unknown as WindowBase64);
const atob = windowBase64.atob || ((b64: string) => Buffer.from(b64, 'base64').toString('binary'));
const btoa = windowBase64.btoa || ((bin: string) => Buffer.from(bin, 'binary').toString('base64'));

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; ++i) {
      arr[i] = bin.charCodeAt(i);
  }
  return arr;
}

function base64FromBytes(arr: Uint8Array): string {
  const bin: string[] = [];
  for (let i = 0; i < arr.byteLength; ++i) {
    bin.push(String.fromCharCode(arr[i]));
  }
  return btoa(bin.join(''));
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