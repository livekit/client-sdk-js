/* eslint-disable */
import { ParticipantInfo } from './model';
import { Writer, Reader } from 'protobufjs/minimal';


export interface SignalRequest {
  offer?: SessionDescription | undefined;
  negotiate?: SessionDescription | undefined;
  trickle?: Trickle | undefined;
  control?: MediaControl | undefined;
}

export interface SignalResponse {
  /**
   *  sent when join is accepted
   */
  join?: JoinResponse | undefined;
  /**
   *  sent when offer is answered
   */
  answer?: SessionDescription | undefined;
  /**
   *  sent when a negotiated sd is available (could be either offer or answer)
   */
  negotiate?: SessionDescription | undefined;
  /**
   *  sent when an ICE candidate is available
   */
  trickle?: Trickle | undefined;
}

export interface Trickle {
  candidate: string;
}

export interface SessionDescription {
  /**
   *  "answer" | "offer" | "pranswer" | "rollback"
   */
  type: string;
  sdp: string;
}

export interface JoinResponse {
  participant?: ParticipantInfo;
}

export interface MediaControl {
}

export interface ParticipantUpdate {
}

const baseSignalRequest: object = {
};

const baseSignalResponse: object = {
};

const baseTrickle: object = {
  candidate: "",
};

const baseSessionDescription: object = {
  type: "",
  sdp: "",
};

const baseJoinResponse: object = {
};

const baseMediaControl: object = {
};

const baseParticipantUpdate: object = {
};

export const protobufPackage = 'livekit'

export const SignalRequest = {
  encode(message: SignalRequest, writer: Writer = Writer.create()): Writer {
    if (message.offer !== undefined) {
      SessionDescription.encode(message.offer, writer.uint32(10).fork()).ldelim();
    }
    if (message.negotiate !== undefined) {
      SessionDescription.encode(message.negotiate, writer.uint32(18).fork()).ldelim();
    }
    if (message.trickle !== undefined) {
      Trickle.encode(message.trickle, writer.uint32(26).fork()).ldelim();
    }
    if (message.control !== undefined) {
      MediaControl.encode(message.control, writer.uint32(34).fork()).ldelim();
    }
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): SignalRequest {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSignalRequest } as SignalRequest;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.offer = SessionDescription.decode(reader, reader.uint32());
          break;
        case 2:
          message.negotiate = SessionDescription.decode(reader, reader.uint32());
          break;
        case 3:
          message.trickle = Trickle.decode(reader, reader.uint32());
          break;
        case 4:
          message.control = MediaControl.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): SignalRequest {
    const message = { ...baseSignalRequest } as SignalRequest;
    if (object.offer !== undefined && object.offer !== null) {
      message.offer = SessionDescription.fromJSON(object.offer);
    } else {
      message.offer = undefined;
    }
    if (object.negotiate !== undefined && object.negotiate !== null) {
      message.negotiate = SessionDescription.fromJSON(object.negotiate);
    } else {
      message.negotiate = undefined;
    }
    if (object.trickle !== undefined && object.trickle !== null) {
      message.trickle = Trickle.fromJSON(object.trickle);
    } else {
      message.trickle = undefined;
    }
    if (object.control !== undefined && object.control !== null) {
      message.control = MediaControl.fromJSON(object.control);
    } else {
      message.control = undefined;
    }
    return message;
  },
  fromPartial(object: DeepPartial<SignalRequest>): SignalRequest {
    const message = { ...baseSignalRequest } as SignalRequest;
    if (object.offer !== undefined && object.offer !== null) {
      message.offer = SessionDescription.fromPartial(object.offer);
    } else {
      message.offer = undefined;
    }
    if (object.negotiate !== undefined && object.negotiate !== null) {
      message.negotiate = SessionDescription.fromPartial(object.negotiate);
    } else {
      message.negotiate = undefined;
    }
    if (object.trickle !== undefined && object.trickle !== null) {
      message.trickle = Trickle.fromPartial(object.trickle);
    } else {
      message.trickle = undefined;
    }
    if (object.control !== undefined && object.control !== null) {
      message.control = MediaControl.fromPartial(object.control);
    } else {
      message.control = undefined;
    }
    return message;
  },
  toJSON(message: SignalRequest): unknown {
    const obj: any = {};
    message.offer !== undefined && (obj.offer = message.offer ? SessionDescription.toJSON(message.offer) : undefined);
    message.negotiate !== undefined && (obj.negotiate = message.negotiate ? SessionDescription.toJSON(message.negotiate) : undefined);
    message.trickle !== undefined && (obj.trickle = message.trickle ? Trickle.toJSON(message.trickle) : undefined);
    message.control !== undefined && (obj.control = message.control ? MediaControl.toJSON(message.control) : undefined);
    return obj;
  },
};

export const SignalResponse = {
  encode(message: SignalResponse, writer: Writer = Writer.create()): Writer {
    if (message.join !== undefined) {
      JoinResponse.encode(message.join, writer.uint32(10).fork()).ldelim();
    }
    if (message.answer !== undefined) {
      SessionDescription.encode(message.answer, writer.uint32(18).fork()).ldelim();
    }
    if (message.negotiate !== undefined) {
      SessionDescription.encode(message.negotiate, writer.uint32(26).fork()).ldelim();
    }
    if (message.trickle !== undefined) {
      Trickle.encode(message.trickle, writer.uint32(34).fork()).ldelim();
    }
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): SignalResponse {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSignalResponse } as SignalResponse;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.join = JoinResponse.decode(reader, reader.uint32());
          break;
        case 2:
          message.answer = SessionDescription.decode(reader, reader.uint32());
          break;
        case 3:
          message.negotiate = SessionDescription.decode(reader, reader.uint32());
          break;
        case 4:
          message.trickle = Trickle.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): SignalResponse {
    const message = { ...baseSignalResponse } as SignalResponse;
    if (object.join !== undefined && object.join !== null) {
      message.join = JoinResponse.fromJSON(object.join);
    } else {
      message.join = undefined;
    }
    if (object.answer !== undefined && object.answer !== null) {
      message.answer = SessionDescription.fromJSON(object.answer);
    } else {
      message.answer = undefined;
    }
    if (object.negotiate !== undefined && object.negotiate !== null) {
      message.negotiate = SessionDescription.fromJSON(object.negotiate);
    } else {
      message.negotiate = undefined;
    }
    if (object.trickle !== undefined && object.trickle !== null) {
      message.trickle = Trickle.fromJSON(object.trickle);
    } else {
      message.trickle = undefined;
    }
    return message;
  },
  fromPartial(object: DeepPartial<SignalResponse>): SignalResponse {
    const message = { ...baseSignalResponse } as SignalResponse;
    if (object.join !== undefined && object.join !== null) {
      message.join = JoinResponse.fromPartial(object.join);
    } else {
      message.join = undefined;
    }
    if (object.answer !== undefined && object.answer !== null) {
      message.answer = SessionDescription.fromPartial(object.answer);
    } else {
      message.answer = undefined;
    }
    if (object.negotiate !== undefined && object.negotiate !== null) {
      message.negotiate = SessionDescription.fromPartial(object.negotiate);
    } else {
      message.negotiate = undefined;
    }
    if (object.trickle !== undefined && object.trickle !== null) {
      message.trickle = Trickle.fromPartial(object.trickle);
    } else {
      message.trickle = undefined;
    }
    return message;
  },
  toJSON(message: SignalResponse): unknown {
    const obj: any = {};
    message.join !== undefined && (obj.join = message.join ? JoinResponse.toJSON(message.join) : undefined);
    message.answer !== undefined && (obj.answer = message.answer ? SessionDescription.toJSON(message.answer) : undefined);
    message.negotiate !== undefined && (obj.negotiate = message.negotiate ? SessionDescription.toJSON(message.negotiate) : undefined);
    message.trickle !== undefined && (obj.trickle = message.trickle ? Trickle.toJSON(message.trickle) : undefined);
    return obj;
  },
};

export const Trickle = {
  encode(message: Trickle, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.candidate);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): Trickle {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseTrickle } as Trickle;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.candidate = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): Trickle {
    const message = { ...baseTrickle } as Trickle;
    if (object.candidate !== undefined && object.candidate !== null) {
      message.candidate = String(object.candidate);
    } else {
      message.candidate = "";
    }
    return message;
  },
  fromPartial(object: DeepPartial<Trickle>): Trickle {
    const message = { ...baseTrickle } as Trickle;
    if (object.candidate !== undefined && object.candidate !== null) {
      message.candidate = object.candidate;
    } else {
      message.candidate = "";
    }
    return message;
  },
  toJSON(message: Trickle): unknown {
    const obj: any = {};
    message.candidate !== undefined && (obj.candidate = message.candidate);
    return obj;
  },
};

export const SessionDescription = {
  encode(message: SessionDescription, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.type);
    writer.uint32(18).string(message.sdp);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): SessionDescription {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSessionDescription } as SessionDescription;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.type = reader.string();
          break;
        case 2:
          message.sdp = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): SessionDescription {
    const message = { ...baseSessionDescription } as SessionDescription;
    if (object.type !== undefined && object.type !== null) {
      message.type = String(object.type);
    } else {
      message.type = "";
    }
    if (object.sdp !== undefined && object.sdp !== null) {
      message.sdp = String(object.sdp);
    } else {
      message.sdp = "";
    }
    return message;
  },
  fromPartial(object: DeepPartial<SessionDescription>): SessionDescription {
    const message = { ...baseSessionDescription } as SessionDescription;
    if (object.type !== undefined && object.type !== null) {
      message.type = object.type;
    } else {
      message.type = "";
    }
    if (object.sdp !== undefined && object.sdp !== null) {
      message.sdp = object.sdp;
    } else {
      message.sdp = "";
    }
    return message;
  },
  toJSON(message: SessionDescription): unknown {
    const obj: any = {};
    message.type !== undefined && (obj.type = message.type);
    message.sdp !== undefined && (obj.sdp = message.sdp);
    return obj;
  },
};

export const JoinResponse = {
  encode(message: JoinResponse, writer: Writer = Writer.create()): Writer {
    if (message.participant !== undefined && message.participant !== undefined) {
      ParticipantInfo.encode(message.participant, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): JoinResponse {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseJoinResponse } as JoinResponse;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.participant = ParticipantInfo.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): JoinResponse {
    const message = { ...baseJoinResponse } as JoinResponse;
    if (object.participant !== undefined && object.participant !== null) {
      message.participant = ParticipantInfo.fromJSON(object.participant);
    } else {
      message.participant = undefined;
    }
    return message;
  },
  fromPartial(object: DeepPartial<JoinResponse>): JoinResponse {
    const message = { ...baseJoinResponse } as JoinResponse;
    if (object.participant !== undefined && object.participant !== null) {
      message.participant = ParticipantInfo.fromPartial(object.participant);
    } else {
      message.participant = undefined;
    }
    return message;
  },
  toJSON(message: JoinResponse): unknown {
    const obj: any = {};
    message.participant !== undefined && (obj.participant = message.participant ? ParticipantInfo.toJSON(message.participant) : undefined);
    return obj;
  },
};

export const MediaControl = {
  encode(_: MediaControl, writer: Writer = Writer.create()): Writer {
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): MediaControl {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseMediaControl } as MediaControl;
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
  fromJSON(_: any): MediaControl {
    const message = { ...baseMediaControl } as MediaControl;
    return message;
  },
  fromPartial(_: DeepPartial<MediaControl>): MediaControl {
    const message = { ...baseMediaControl } as MediaControl;
    return message;
  },
  toJSON(_: MediaControl): unknown {
    const obj: any = {};
    return obj;
  },
};

export const ParticipantUpdate = {
  encode(_: ParticipantUpdate, writer: Writer = Writer.create()): Writer {
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): ParticipantUpdate {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseParticipantUpdate } as ParticipantUpdate;
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
  fromJSON(_: any): ParticipantUpdate {
    const message = { ...baseParticipantUpdate } as ParticipantUpdate;
    return message;
  },
  fromPartial(_: DeepPartial<ParticipantUpdate>): ParticipantUpdate {
    const message = { ...baseParticipantUpdate } as ParticipantUpdate;
    return message;
  },
  toJSON(_: ParticipantUpdate): unknown {
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