/* eslint-disable */
import { Room } from './model';
import { Writer, Reader } from 'protobufjs/minimal';


export interface CreateRoomRequest {
  name: string;
  /**
   *  number of seconds the room should cleanup after being empty
   */
  emptyTimeout: number;
  maxParticipants: number;
}

export interface ListRoomsRequest {
}

export interface ListRoomsResponse {
  rooms: Room[];
}

export interface DeleteRoomRequest {
  room: string;
}

export interface DeleteRoomResponse {
}

const baseCreateRoomRequest: object = {
  name: "",
  emptyTimeout: 0,
  maxParticipants: 0,
};

const baseListRoomsRequest: object = {
};

const baseListRoomsResponse: object = {
};

const baseDeleteRoomRequest: object = {
  room: "",
};

const baseDeleteRoomResponse: object = {
};

/**
 *  Room service that can be performed on any node
 *  they are simple HTTP req/responses
 */
export interface RoomService {

  /**
   *  TODO: how do we secure room service?
   *  should be accessible to only internal servers, not external
   */
  CreateRoom(request: CreateRoomRequest): Promise<Room>;

  ListRooms(request: ListRoomsRequest): Promise<ListRoomsResponse>;

  DeleteRoom(request: DeleteRoomRequest): Promise<DeleteRoomResponse>;

}

export const protobufPackage = 'livekit'

export const CreateRoomRequest = {
  encode(message: CreateRoomRequest, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.name);
    writer.uint32(16).uint32(message.emptyTimeout);
    writer.uint32(24).uint32(message.maxParticipants);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): CreateRoomRequest {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseCreateRoomRequest } as CreateRoomRequest;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.name = reader.string();
          break;
        case 2:
          message.emptyTimeout = reader.uint32();
          break;
        case 3:
          message.maxParticipants = reader.uint32();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): CreateRoomRequest {
    const message = { ...baseCreateRoomRequest } as CreateRoomRequest;
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
    return message;
  },
  fromPartial(object: DeepPartial<CreateRoomRequest>): CreateRoomRequest {
    const message = { ...baseCreateRoomRequest } as CreateRoomRequest;
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
    return message;
  },
  toJSON(message: CreateRoomRequest): unknown {
    const obj: any = {};
    message.name !== undefined && (obj.name = message.name);
    message.emptyTimeout !== undefined && (obj.emptyTimeout = message.emptyTimeout);
    message.maxParticipants !== undefined && (obj.maxParticipants = message.maxParticipants);
    return obj;
  },
};

export const ListRoomsRequest = {
  encode(_: ListRoomsRequest, writer: Writer = Writer.create()): Writer {
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): ListRoomsRequest {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseListRoomsRequest } as ListRoomsRequest;
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
  fromJSON(_: any): ListRoomsRequest {
    const message = { ...baseListRoomsRequest } as ListRoomsRequest;
    return message;
  },
  fromPartial(_: DeepPartial<ListRoomsRequest>): ListRoomsRequest {
    const message = { ...baseListRoomsRequest } as ListRoomsRequest;
    return message;
  },
  toJSON(_: ListRoomsRequest): unknown {
    const obj: any = {};
    return obj;
  },
};

export const ListRoomsResponse = {
  encode(message: ListRoomsResponse, writer: Writer = Writer.create()): Writer {
    for (const v of message.rooms) {
      Room.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): ListRoomsResponse {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseListRoomsResponse } as ListRoomsResponse;
    message.rooms = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.rooms.push(Room.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): ListRoomsResponse {
    const message = { ...baseListRoomsResponse } as ListRoomsResponse;
    message.rooms = [];
    if (object.rooms !== undefined && object.rooms !== null) {
      for (const e of object.rooms) {
        message.rooms.push(Room.fromJSON(e));
      }
    }
    return message;
  },
  fromPartial(object: DeepPartial<ListRoomsResponse>): ListRoomsResponse {
    const message = { ...baseListRoomsResponse } as ListRoomsResponse;
    message.rooms = [];
    if (object.rooms !== undefined && object.rooms !== null) {
      for (const e of object.rooms) {
        message.rooms.push(Room.fromPartial(e));
      }
    }
    return message;
  },
  toJSON(message: ListRoomsResponse): unknown {
    const obj: any = {};
    if (message.rooms) {
      obj.rooms = message.rooms.map(e => e ? Room.toJSON(e) : undefined);
    } else {
      obj.rooms = [];
    }
    return obj;
  },
};

export const DeleteRoomRequest = {
  encode(message: DeleteRoomRequest, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.room);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): DeleteRoomRequest {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseDeleteRoomRequest } as DeleteRoomRequest;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.room = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): DeleteRoomRequest {
    const message = { ...baseDeleteRoomRequest } as DeleteRoomRequest;
    if (object.room !== undefined && object.room !== null) {
      message.room = String(object.room);
    } else {
      message.room = "";
    }
    return message;
  },
  fromPartial(object: DeepPartial<DeleteRoomRequest>): DeleteRoomRequest {
    const message = { ...baseDeleteRoomRequest } as DeleteRoomRequest;
    if (object.room !== undefined && object.room !== null) {
      message.room = object.room;
    } else {
      message.room = "";
    }
    return message;
  },
  toJSON(message: DeleteRoomRequest): unknown {
    const obj: any = {};
    message.room !== undefined && (obj.room = message.room);
    return obj;
  },
};

export const DeleteRoomResponse = {
  encode(_: DeleteRoomResponse, writer: Writer = Writer.create()): Writer {
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): DeleteRoomResponse {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseDeleteRoomResponse } as DeleteRoomResponse;
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
  fromJSON(_: any): DeleteRoomResponse {
    const message = { ...baseDeleteRoomResponse } as DeleteRoomResponse;
    return message;
  },
  fromPartial(_: DeepPartial<DeleteRoomResponse>): DeleteRoomResponse {
    const message = { ...baseDeleteRoomResponse } as DeleteRoomResponse;
    return message;
  },
  toJSON(_: DeleteRoomResponse): unknown {
    const obj: any = {};
    return obj;
  },
};

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