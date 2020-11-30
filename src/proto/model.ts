/* eslint-disable */
import * as Long from 'long';
import { Writer, Reader, util, configure } from 'protobufjs/minimal';


export interface Node {
  id: string;
  ip: string;
  rtcPort: number;
  stats?: NodeStats;
}

export interface NodeStats {
  numRooms: number;
  numClients: number;
}

/**
 *  internal type, for serialization with proto
 */
export interface Room {
  id: string;
  emptyTimeout: number;
  maxParticipants: number;
  creationTime: number;
  token: string;
}

export interface RoomInfo {
  id: string;
  nodeIp: string;
  creationTime: number;
  token: string;
}

export interface ParticipantInfo {
  id: string;
  name: string;
  state: ParticipantInfo_State;
  hasAudio: boolean;
  hasVideo: boolean;
}

export interface DataChannel {
  sessionId: string;
  payload: Uint8Array;
}

const baseNode: object = {
  id: "",
  ip: "",
  rtcPort: 0,
};

const baseNodeStats: object = {
  numRooms: 0,
  numClients: 0,
};

const baseRoom: object = {
  id: "",
  emptyTimeout: 0,
  maxParticipants: 0,
  creationTime: 0,
  token: "",
};

const baseRoomInfo: object = {
  id: "",
  nodeIp: "",
  creationTime: 0,
  token: "",
};

const baseParticipantInfo: object = {
  id: "",
  name: "",
  state: 0,
  hasAudio: false,
  hasVideo: false,
};

const baseDataChannel: object = {
  sessionId: "",
};

function longToNumber(long: Long) {
  if (long.gt(Number.MAX_SAFE_INTEGER)) {
    throw new globalThis.Error("Value is larger than Number.MAX_SAFE_INTEGER");
  }
  return long.toNumber();
}

export const protobufPackage = 'livekit'

export enum ParticipantInfo_State {
  /** JOINING -  websocket connected, but not offered yet
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

export const Node = {
  encode(message: Node, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.id);
    writer.uint32(18).string(message.ip);
    writer.uint32(24).uint32(message.rtcPort);
    if (message.stats !== undefined && message.stats !== undefined) {
      NodeStats.encode(message.stats, writer.uint32(34).fork()).ldelim();
    }
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): Node {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseNode } as Node;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.id = reader.string();
          break;
        case 2:
          message.ip = reader.string();
          break;
        case 3:
          message.rtcPort = reader.uint32();
          break;
        case 4:
          message.stats = NodeStats.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): Node {
    const message = { ...baseNode } as Node;
    if (object.id !== undefined && object.id !== null) {
      message.id = String(object.id);
    } else {
      message.id = "";
    }
    if (object.ip !== undefined && object.ip !== null) {
      message.ip = String(object.ip);
    } else {
      message.ip = "";
    }
    if (object.rtcPort !== undefined && object.rtcPort !== null) {
      message.rtcPort = Number(object.rtcPort);
    } else {
      message.rtcPort = 0;
    }
    if (object.stats !== undefined && object.stats !== null) {
      message.stats = NodeStats.fromJSON(object.stats);
    } else {
      message.stats = undefined;
    }
    return message;
  },
  fromPartial(object: DeepPartial<Node>): Node {
    const message = { ...baseNode } as Node;
    if (object.id !== undefined && object.id !== null) {
      message.id = object.id;
    } else {
      message.id = "";
    }
    if (object.ip !== undefined && object.ip !== null) {
      message.ip = object.ip;
    } else {
      message.ip = "";
    }
    if (object.rtcPort !== undefined && object.rtcPort !== null) {
      message.rtcPort = object.rtcPort;
    } else {
      message.rtcPort = 0;
    }
    if (object.stats !== undefined && object.stats !== null) {
      message.stats = NodeStats.fromPartial(object.stats);
    } else {
      message.stats = undefined;
    }
    return message;
  },
  toJSON(message: Node): unknown {
    const obj: any = {};
    message.id !== undefined && (obj.id = message.id);
    message.ip !== undefined && (obj.ip = message.ip);
    message.rtcPort !== undefined && (obj.rtcPort = message.rtcPort);
    message.stats !== undefined && (obj.stats = message.stats ? NodeStats.toJSON(message.stats) : undefined);
    return obj;
  },
};

export const NodeStats = {
  encode(message: NodeStats, writer: Writer = Writer.create()): Writer {
    writer.uint32(8).int32(message.numRooms);
    writer.uint32(16).int32(message.numClients);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): NodeStats {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseNodeStats } as NodeStats;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.numRooms = reader.int32();
          break;
        case 2:
          message.numClients = reader.int32();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): NodeStats {
    const message = { ...baseNodeStats } as NodeStats;
    if (object.numRooms !== undefined && object.numRooms !== null) {
      message.numRooms = Number(object.numRooms);
    } else {
      message.numRooms = 0;
    }
    if (object.numClients !== undefined && object.numClients !== null) {
      message.numClients = Number(object.numClients);
    } else {
      message.numClients = 0;
    }
    return message;
  },
  fromPartial(object: DeepPartial<NodeStats>): NodeStats {
    const message = { ...baseNodeStats } as NodeStats;
    if (object.numRooms !== undefined && object.numRooms !== null) {
      message.numRooms = object.numRooms;
    } else {
      message.numRooms = 0;
    }
    if (object.numClients !== undefined && object.numClients !== null) {
      message.numClients = object.numClients;
    } else {
      message.numClients = 0;
    }
    return message;
  },
  toJSON(message: NodeStats): unknown {
    const obj: any = {};
    message.numRooms !== undefined && (obj.numRooms = message.numRooms);
    message.numClients !== undefined && (obj.numClients = message.numClients);
    return obj;
  },
};

export const Room = {
  encode(message: Room, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.id);
    writer.uint32(16).uint32(message.emptyTimeout);
    writer.uint32(24).uint32(message.maxParticipants);
    writer.uint32(32).int64(message.creationTime);
    writer.uint32(42).string(message.token);
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
          message.id = reader.string();
          break;
        case 2:
          message.emptyTimeout = reader.uint32();
          break;
        case 3:
          message.maxParticipants = reader.uint32();
          break;
        case 4:
          message.creationTime = longToNumber(reader.int64() as Long);
          break;
        case 5:
          message.token = reader.string();
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
    if (object.id !== undefined && object.id !== null) {
      message.id = String(object.id);
    } else {
      message.id = "";
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
    if (object.token !== undefined && object.token !== null) {
      message.token = String(object.token);
    } else {
      message.token = "";
    }
    return message;
  },
  fromPartial(object: DeepPartial<Room>): Room {
    const message = { ...baseRoom } as Room;
    if (object.id !== undefined && object.id !== null) {
      message.id = object.id;
    } else {
      message.id = "";
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
    if (object.token !== undefined && object.token !== null) {
      message.token = object.token;
    } else {
      message.token = "";
    }
    return message;
  },
  toJSON(message: Room): unknown {
    const obj: any = {};
    message.id !== undefined && (obj.id = message.id);
    message.emptyTimeout !== undefined && (obj.emptyTimeout = message.emptyTimeout);
    message.maxParticipants !== undefined && (obj.maxParticipants = message.maxParticipants);
    message.creationTime !== undefined && (obj.creationTime = message.creationTime);
    message.token !== undefined && (obj.token = message.token);
    return obj;
  },
};

export const RoomInfo = {
  encode(message: RoomInfo, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.id);
    writer.uint32(18).string(message.nodeIp);
    writer.uint32(24).int64(message.creationTime);
    writer.uint32(34).string(message.token);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): RoomInfo {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseRoomInfo } as RoomInfo;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.id = reader.string();
          break;
        case 2:
          message.nodeIp = reader.string();
          break;
        case 3:
          message.creationTime = longToNumber(reader.int64() as Long);
          break;
        case 4:
          message.token = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): RoomInfo {
    const message = { ...baseRoomInfo } as RoomInfo;
    if (object.id !== undefined && object.id !== null) {
      message.id = String(object.id);
    } else {
      message.id = "";
    }
    if (object.nodeIp !== undefined && object.nodeIp !== null) {
      message.nodeIp = String(object.nodeIp);
    } else {
      message.nodeIp = "";
    }
    if (object.creationTime !== undefined && object.creationTime !== null) {
      message.creationTime = Number(object.creationTime);
    } else {
      message.creationTime = 0;
    }
    if (object.token !== undefined && object.token !== null) {
      message.token = String(object.token);
    } else {
      message.token = "";
    }
    return message;
  },
  fromPartial(object: DeepPartial<RoomInfo>): RoomInfo {
    const message = { ...baseRoomInfo } as RoomInfo;
    if (object.id !== undefined && object.id !== null) {
      message.id = object.id;
    } else {
      message.id = "";
    }
    if (object.nodeIp !== undefined && object.nodeIp !== null) {
      message.nodeIp = object.nodeIp;
    } else {
      message.nodeIp = "";
    }
    if (object.creationTime !== undefined && object.creationTime !== null) {
      message.creationTime = object.creationTime;
    } else {
      message.creationTime = 0;
    }
    if (object.token !== undefined && object.token !== null) {
      message.token = object.token;
    } else {
      message.token = "";
    }
    return message;
  },
  toJSON(message: RoomInfo): unknown {
    const obj: any = {};
    message.id !== undefined && (obj.id = message.id);
    message.nodeIp !== undefined && (obj.nodeIp = message.nodeIp);
    message.creationTime !== undefined && (obj.creationTime = message.creationTime);
    message.token !== undefined && (obj.token = message.token);
    return obj;
  },
};

export const ParticipantInfo = {
  encode(message: ParticipantInfo, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.id);
    writer.uint32(18).string(message.name);
    writer.uint32(24).int32(message.state);
    writer.uint32(32).bool(message.hasAudio);
    writer.uint32(40).bool(message.hasVideo);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): ParticipantInfo {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseParticipantInfo } as ParticipantInfo;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.id = reader.string();
          break;
        case 2:
          message.name = reader.string();
          break;
        case 3:
          message.state = reader.int32() as any;
          break;
        case 4:
          message.hasAudio = reader.bool();
          break;
        case 5:
          message.hasVideo = reader.bool();
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
    if (object.id !== undefined && object.id !== null) {
      message.id = String(object.id);
    } else {
      message.id = "";
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
    if (object.hasAudio !== undefined && object.hasAudio !== null) {
      message.hasAudio = Boolean(object.hasAudio);
    } else {
      message.hasAudio = false;
    }
    if (object.hasVideo !== undefined && object.hasVideo !== null) {
      message.hasVideo = Boolean(object.hasVideo);
    } else {
      message.hasVideo = false;
    }
    return message;
  },
  fromPartial(object: DeepPartial<ParticipantInfo>): ParticipantInfo {
    const message = { ...baseParticipantInfo } as ParticipantInfo;
    if (object.id !== undefined && object.id !== null) {
      message.id = object.id;
    } else {
      message.id = "";
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
    if (object.hasAudio !== undefined && object.hasAudio !== null) {
      message.hasAudio = object.hasAudio;
    } else {
      message.hasAudio = false;
    }
    if (object.hasVideo !== undefined && object.hasVideo !== null) {
      message.hasVideo = object.hasVideo;
    } else {
      message.hasVideo = false;
    }
    return message;
  },
  toJSON(message: ParticipantInfo): unknown {
    const obj: any = {};
    message.id !== undefined && (obj.id = message.id);
    message.name !== undefined && (obj.name = message.name);
    message.state !== undefined && (obj.state = participantInfo_StateToJSON(message.state));
    message.hasAudio !== undefined && (obj.hasAudio = message.hasAudio);
    message.hasVideo !== undefined && (obj.hasVideo = message.hasVideo);
    return obj;
  },
};

export const DataChannel = {
  encode(message: DataChannel, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.sessionId);
    writer.uint32(18).bytes(message.payload);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): DataChannel {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseDataChannel } as DataChannel;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sessionId = reader.string();
          break;
        case 2:
          message.payload = reader.bytes();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): DataChannel {
    const message = { ...baseDataChannel } as DataChannel;
    if (object.sessionId !== undefined && object.sessionId !== null) {
      message.sessionId = String(object.sessionId);
    } else {
      message.sessionId = "";
    }
    if (object.payload !== undefined && object.payload !== null) {
      message.payload = bytesFromBase64(object.payload);
    }
    return message;
  },
  fromPartial(object: DeepPartial<DataChannel>): DataChannel {
    const message = { ...baseDataChannel } as DataChannel;
    if (object.sessionId !== undefined && object.sessionId !== null) {
      message.sessionId = object.sessionId;
    } else {
      message.sessionId = "";
    }
    if (object.payload !== undefined && object.payload !== null) {
      message.payload = object.payload;
    } else {
      message.payload = new Uint8Array();
    }
    return message;
  },
  toJSON(message: DataChannel): unknown {
    const obj: any = {};
    message.sessionId !== undefined && (obj.sessionId = message.sessionId);
    message.payload !== undefined && (obj.payload = base64FromBytes(message.payload !== undefined ? message.payload : new Uint8Array()));
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