/* eslint-disable */
import { TrackInfo, RoomInfo, ParticipantInfo } from './model';
import { Writer, Reader } from 'protobufjs/minimal';


export interface SignalRequest {
  offer?: SessionDescription | undefined;
  negotiate?: SessionDescription | undefined;
  trickle?: Trickle | undefined;
  mute?: MuteTrack | undefined;
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
  /**
   *  sent when participants in the room has changed
   */
  update?: ParticipantUpdate | undefined;
  /**
   *  sent to the participant when their track has been published
   */
  trackPublished?: TrackInfo | undefined;
}

export interface Trickle {
  candidateInit: string;
}

export interface SessionDescription {
  /**
   *  "answer" | "offer" | "pranswer" | "rollback"
   */
  type: string;
  sdp: string;
}

export interface JoinResponse {
  room?: RoomInfo;
  participant?: ParticipantInfo;
  otherParticipants: ParticipantInfo[];
}

export interface MuteTrack {
  trackSid: string;
  muted: boolean;
}

export interface ParticipantUpdate {
  participants: ParticipantInfo[];
}

const baseSignalRequest: object = {
};

const baseSignalResponse: object = {
};

const baseTrickle: object = {
  candidateInit: "",
};

const baseSessionDescription: object = {
  type: "",
  sdp: "",
};

const baseJoinResponse: object = {
};

const baseMuteTrack: object = {
  trackSid: "",
  muted: false,
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
    if (message.mute !== undefined) {
      MuteTrack.encode(message.mute, writer.uint32(34).fork()).ldelim();
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
          message.mute = MuteTrack.decode(reader, reader.uint32());
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
    if (object.mute !== undefined && object.mute !== null) {
      message.mute = MuteTrack.fromJSON(object.mute);
    } else {
      message.mute = undefined;
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
    if (object.mute !== undefined && object.mute !== null) {
      message.mute = MuteTrack.fromPartial(object.mute);
    } else {
      message.mute = undefined;
    }
    return message;
  },
  toJSON(message: SignalRequest): unknown {
    const obj: any = {};
    message.offer !== undefined && (obj.offer = message.offer ? SessionDescription.toJSON(message.offer) : undefined);
    message.negotiate !== undefined && (obj.negotiate = message.negotiate ? SessionDescription.toJSON(message.negotiate) : undefined);
    message.trickle !== undefined && (obj.trickle = message.trickle ? Trickle.toJSON(message.trickle) : undefined);
    message.mute !== undefined && (obj.mute = message.mute ? MuteTrack.toJSON(message.mute) : undefined);
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
    if (message.update !== undefined) {
      ParticipantUpdate.encode(message.update, writer.uint32(42).fork()).ldelim();
    }
    if (message.trackPublished !== undefined) {
      TrackInfo.encode(message.trackPublished, writer.uint32(50).fork()).ldelim();
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
        case 5:
          message.update = ParticipantUpdate.decode(reader, reader.uint32());
          break;
        case 6:
          message.trackPublished = TrackInfo.decode(reader, reader.uint32());
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
    if (object.update !== undefined && object.update !== null) {
      message.update = ParticipantUpdate.fromJSON(object.update);
    } else {
      message.update = undefined;
    }
    if (object.trackPublished !== undefined && object.trackPublished !== null) {
      message.trackPublished = TrackInfo.fromJSON(object.trackPublished);
    } else {
      message.trackPublished = undefined;
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
    if (object.update !== undefined && object.update !== null) {
      message.update = ParticipantUpdate.fromPartial(object.update);
    } else {
      message.update = undefined;
    }
    if (object.trackPublished !== undefined && object.trackPublished !== null) {
      message.trackPublished = TrackInfo.fromPartial(object.trackPublished);
    } else {
      message.trackPublished = undefined;
    }
    return message;
  },
  toJSON(message: SignalResponse): unknown {
    const obj: any = {};
    message.join !== undefined && (obj.join = message.join ? JoinResponse.toJSON(message.join) : undefined);
    message.answer !== undefined && (obj.answer = message.answer ? SessionDescription.toJSON(message.answer) : undefined);
    message.negotiate !== undefined && (obj.negotiate = message.negotiate ? SessionDescription.toJSON(message.negotiate) : undefined);
    message.trickle !== undefined && (obj.trickle = message.trickle ? Trickle.toJSON(message.trickle) : undefined);
    message.update !== undefined && (obj.update = message.update ? ParticipantUpdate.toJSON(message.update) : undefined);
    message.trackPublished !== undefined && (obj.trackPublished = message.trackPublished ? TrackInfo.toJSON(message.trackPublished) : undefined);
    return obj;
  },
};

export const Trickle = {
  encode(message: Trickle, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.candidateInit);
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
          message.candidateInit = reader.string();
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
    if (object.candidateInit !== undefined && object.candidateInit !== null) {
      message.candidateInit = String(object.candidateInit);
    } else {
      message.candidateInit = "";
    }
    return message;
  },
  fromPartial(object: DeepPartial<Trickle>): Trickle {
    const message = { ...baseTrickle } as Trickle;
    if (object.candidateInit !== undefined && object.candidateInit !== null) {
      message.candidateInit = object.candidateInit;
    } else {
      message.candidateInit = "";
    }
    return message;
  },
  toJSON(message: Trickle): unknown {
    const obj: any = {};
    message.candidateInit !== undefined && (obj.candidateInit = message.candidateInit);
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
    if (message.room !== undefined && message.room !== undefined) {
      RoomInfo.encode(message.room, writer.uint32(10).fork()).ldelim();
    }
    if (message.participant !== undefined && message.participant !== undefined) {
      ParticipantInfo.encode(message.participant, writer.uint32(18).fork()).ldelim();
    }
    for (const v of message.otherParticipants) {
      ParticipantInfo.encode(v!, writer.uint32(26).fork()).ldelim();
    }
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): JoinResponse {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseJoinResponse } as JoinResponse;
    message.otherParticipants = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.room = RoomInfo.decode(reader, reader.uint32());
          break;
        case 2:
          message.participant = ParticipantInfo.decode(reader, reader.uint32());
          break;
        case 3:
          message.otherParticipants.push(ParticipantInfo.decode(reader, reader.uint32()));
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
    message.otherParticipants = [];
    if (object.room !== undefined && object.room !== null) {
      message.room = RoomInfo.fromJSON(object.room);
    } else {
      message.room = undefined;
    }
    if (object.participant !== undefined && object.participant !== null) {
      message.participant = ParticipantInfo.fromJSON(object.participant);
    } else {
      message.participant = undefined;
    }
    if (object.otherParticipants !== undefined && object.otherParticipants !== null) {
      for (const e of object.otherParticipants) {
        message.otherParticipants.push(ParticipantInfo.fromJSON(e));
      }
    }
    return message;
  },
  fromPartial(object: DeepPartial<JoinResponse>): JoinResponse {
    const message = { ...baseJoinResponse } as JoinResponse;
    message.otherParticipants = [];
    if (object.room !== undefined && object.room !== null) {
      message.room = RoomInfo.fromPartial(object.room);
    } else {
      message.room = undefined;
    }
    if (object.participant !== undefined && object.participant !== null) {
      message.participant = ParticipantInfo.fromPartial(object.participant);
    } else {
      message.participant = undefined;
    }
    if (object.otherParticipants !== undefined && object.otherParticipants !== null) {
      for (const e of object.otherParticipants) {
        message.otherParticipants.push(ParticipantInfo.fromPartial(e));
      }
    }
    return message;
  },
  toJSON(message: JoinResponse): unknown {
    const obj: any = {};
    message.room !== undefined && (obj.room = message.room ? RoomInfo.toJSON(message.room) : undefined);
    message.participant !== undefined && (obj.participant = message.participant ? ParticipantInfo.toJSON(message.participant) : undefined);
    if (message.otherParticipants) {
      obj.otherParticipants = message.otherParticipants.map(e => e ? ParticipantInfo.toJSON(e) : undefined);
    } else {
      obj.otherParticipants = [];
    }
    return obj;
  },
};

export const MuteTrack = {
  encode(message: MuteTrack, writer: Writer = Writer.create()): Writer {
    writer.uint32(10).string(message.trackSid);
    writer.uint32(16).bool(message.muted);
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): MuteTrack {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseMuteTrack } as MuteTrack;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.trackSid = reader.string();
          break;
        case 2:
          message.muted = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): MuteTrack {
    const message = { ...baseMuteTrack } as MuteTrack;
    if (object.trackSid !== undefined && object.trackSid !== null) {
      message.trackSid = String(object.trackSid);
    } else {
      message.trackSid = "";
    }
    if (object.muted !== undefined && object.muted !== null) {
      message.muted = Boolean(object.muted);
    } else {
      message.muted = false;
    }
    return message;
  },
  fromPartial(object: DeepPartial<MuteTrack>): MuteTrack {
    const message = { ...baseMuteTrack } as MuteTrack;
    if (object.trackSid !== undefined && object.trackSid !== null) {
      message.trackSid = object.trackSid;
    } else {
      message.trackSid = "";
    }
    if (object.muted !== undefined && object.muted !== null) {
      message.muted = object.muted;
    } else {
      message.muted = false;
    }
    return message;
  },
  toJSON(message: MuteTrack): unknown {
    const obj: any = {};
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    message.muted !== undefined && (obj.muted = message.muted);
    return obj;
  },
};

export const ParticipantUpdate = {
  encode(message: ParticipantUpdate, writer: Writer = Writer.create()): Writer {
    for (const v of message.participants) {
      ParticipantInfo.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },
  decode(input: Uint8Array | Reader, length?: number): ParticipantUpdate {
    const reader = input instanceof Uint8Array ? new Reader(input) : input;
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseParticipantUpdate } as ParticipantUpdate;
    message.participants = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.participants.push(ParticipantInfo.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },
  fromJSON(object: any): ParticipantUpdate {
    const message = { ...baseParticipantUpdate } as ParticipantUpdate;
    message.participants = [];
    if (object.participants !== undefined && object.participants !== null) {
      for (const e of object.participants) {
        message.participants.push(ParticipantInfo.fromJSON(e));
      }
    }
    return message;
  },
  fromPartial(object: DeepPartial<ParticipantUpdate>): ParticipantUpdate {
    const message = { ...baseParticipantUpdate } as ParticipantUpdate;
    message.participants = [];
    if (object.participants !== undefined && object.participants !== null) {
      for (const e of object.participants) {
        message.participants.push(ParticipantInfo.fromPartial(e));
      }
    }
    return message;
  },
  toJSON(message: ParticipantUpdate): unknown {
    const obj: any = {};
    if (message.participants) {
      obj.participants = message.participants.map(e => e ? ParticipantInfo.toJSON(e) : undefined);
    } else {
      obj.participants = [];
    }
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