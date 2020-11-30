/* eslint-disable */
import { RoomInfo } from './model';
import { Writer, Reader } from 'protobufjs/minimal';


export interface CreateRoomRequest {
  /**
   *  number of seconds the room should cleanup after being empty
   */
  emptyTimeout: number;
  maxParticipants: number;
}

export interface GetRoomRequest {
  roomId: string;
}

export interface DeleteRoomRequest {
  roomId: string;
}

export interface DeleteRoomResponse {
}

const baseCreateRoomRequest: object = {
  emptyTimeout: 0,
  maxParticipants: 0,
};

const baseGetRoomRequest: object = {
  roomId: "",
};

const baseDeleteRoomRequest: object = {
  roomId: "",
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
  CreateRoom(request: CreateRoomRequest): Promise<RoomInfo>;

  GetRoom(request: GetRoomRequest): Promise<RoomInfo>;

  DeleteRoom(request: DeleteRoomRequest): Promise<DeleteRoomResponse>;

}

export const protobufPackage = 'livekit'

export const CreateRoomRequest = {
  encode(message: CreateRoomRequest, writer: Writer = Writer.create()): Writer {
    writer.uint32(8).uint32(message.emptyTimeout);
    writer.uint32(16).uint32(message.maxParticipants);
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
          message.emptyTimeout = reader.uint32();
          break;
        case 2:
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
    message.emptyTimeout !== undefined && (obj.emptyTimeout = message.emptyTimeout);
    message.maxParticipants !== undefined && (obj.maxParticipants = message.maxParticipants);
    return obj;
  },
};

export const GetRoomRequest = {
  encode(message: GetRoomRequest, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.roomId);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): GetRoomRequest {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseGetRoomRequest } as GetRoomRequest;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.roomId = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): GetRoomRequest {
    const message = { ...baseGetRoomRequest } as GetRoomRequest;
    if (object.roomId !== undefined && object.roomId !== null) {
      message.roomId = String(object.roomId);
    } else {
      message.roomId = "";
    }
    return message;
  },
  fromPartial(object: DeepPartial<GetRoomRequest>): GetRoomRequest {
    const message = { ...baseGetRoomRequest } as GetRoomRequest;
    if (object.roomId !== undefined && object.roomId !== null) {
      message.roomId = object.roomId;
    } else {
      message.roomId = "";
    }
    return message;
  },
  toJSON(message: GetRoomRequest): unknown {
    const obj: any = {};
    message.roomId !== undefined && (obj.roomId = message.roomId);
    return obj;
  },
};

export const DeleteRoomRequest = {
  encode(message: DeleteRoomRequest, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.roomId);
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
          message.roomId = reader.string();
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
    if (object.roomId !== undefined && object.roomId !== null) {
      message.roomId = String(object.roomId);
    } else {
      message.roomId = "";
    }
    return message;
  },
  fromPartial(object: DeepPartial<DeleteRoomRequest>): DeleteRoomRequest {
    const message = { ...baseDeleteRoomRequest } as DeleteRoomRequest;
    if (object.roomId !== undefined && object.roomId !== null) {
      message.roomId = object.roomId;
    } else {
      message.roomId = "";
    }
    return message;
  },
  toJSON(message: DeleteRoomRequest): unknown {
    const obj: any = {};
    message.roomId !== undefined && (obj.roomId = message.roomId);
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