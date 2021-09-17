/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";
import {
  TrackType,
  Room,
  ParticipantInfo,
  TrackInfo,
  SpeakerInfo,
  trackTypeFromJSON,
  trackTypeToJSON,
} from "./livekit_models";

export const protobufPackage = "livekit";

export enum SignalTarget {
  PUBLISHER = 0,
  SUBSCRIBER = 1,
  UNRECOGNIZED = -1,
}

export function signalTargetFromJSON(object: any): SignalTarget {
  switch (object) {
    case 0:
    case "PUBLISHER":
      return SignalTarget.PUBLISHER;
    case 1:
    case "SUBSCRIBER":
      return SignalTarget.SUBSCRIBER;
    case -1:
    case "UNRECOGNIZED":
    default:
      return SignalTarget.UNRECOGNIZED;
  }
}

export function signalTargetToJSON(object: SignalTarget): string {
  switch (object) {
    case SignalTarget.PUBLISHER:
      return "PUBLISHER";
    case SignalTarget.SUBSCRIBER:
      return "SUBSCRIBER";
    default:
      return "UNKNOWN";
  }
}

export enum VideoQuality {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
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
    default:
      return "UNKNOWN";
  }
}

export interface SignalRequest {
  /** initial join exchange, for publisher */
  offer?: SessionDescription | undefined;
  /** participant answering publisher offer */
  answer?: SessionDescription | undefined;
  trickle?: TrickleRequest | undefined;
  addTrack?: AddTrackRequest | undefined;
  /** mute the participant's published tracks */
  mute?: MuteTrackRequest | undefined;
  /** Subscribe or unsubscribe from tracks */
  subscription?: UpdateSubscription | undefined;
  /** Update settings of subscribed tracks */
  trackSetting?: UpdateTrackSettings | undefined;
  /** Immediately terminate session */
  leave?: LeaveRequest | undefined;
  /** Set active published layers */
  simulcast?: SetSimulcastLayers | undefined;
}

export interface SignalResponse {
  /** sent when join is accepted */
  join?: JoinResponse | undefined;
  /** sent when server answers publisher */
  answer?: SessionDescription | undefined;
  /** sent when server is sending subscriber an offer */
  offer?: SessionDescription | undefined;
  /** sent when an ICE candidate is available */
  trickle?: TrickleRequest | undefined;
  /** sent when participants in the room has changed */
  update?: ParticipantUpdate | undefined;
  /** sent to the participant when their track has been published */
  trackPublished?: TrackPublishedResponse | undefined;
  /** Immediately terminate session */
  leave?: LeaveRequest | undefined;
  /** server initiated mute */
  mute?: MuteTrackRequest | undefined;
  /** indicates changes to speaker status, including when they've gone to not speaking */
  speakersChanged?: SpeakersChanged | undefined;
}

export interface AddTrackRequest {
  /** client ID of track, to match it when RTC track is received */
  cid: string;
  name: string;
  type: TrackType;
  width: number;
  height: number;
  /** true to add track and initialize to muted */
  muted: boolean;
}

export interface TrickleRequest {
  candidateInit: string;
  target: SignalTarget;
}

export interface MuteTrackRequest {
  sid: string;
  muted: boolean;
}

export interface SetSimulcastLayers {
  trackSid: string;
  layers: VideoQuality[];
}

export interface JoinResponse {
  room?: Room;
  participant?: ParticipantInfo;
  otherParticipants: ParticipantInfo[];
  serverVersion: string;
  iceServers: ICEServer[];
  /** use subscriber as the primary PeerConnection */
  subscriberPrimary: boolean;
}

export interface TrackPublishedResponse {
  cid: string;
  track?: TrackInfo;
}

export interface SessionDescription {
  /** "answer" | "offer" | "pranswer" | "rollback" */
  type: string;
  sdp: string;
}

export interface ParticipantUpdate {
  participants: ParticipantInfo[];
}

export interface UpdateSubscription {
  trackSids: string[];
  subscribe: boolean;
}

export interface UpdateTrackSettings {
  trackSids: string[];
  disabled: boolean;
  quality: VideoQuality;
}

export interface LeaveRequest {
  /**
   * sent when server initiates the disconnect due to server-restart
   * indicates clients should attempt full-reconnect sequence
   */
  canReconnect: boolean;
}

export interface ICEServer {
  urls: string[];
  username: string;
  credential: string;
}

export interface SpeakersChanged {
  speakers: SpeakerInfo[];
}

const baseSignalRequest: object = {};

export const SignalRequest = {
  encode(
    message: SignalRequest,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.offer !== undefined) {
      SessionDescription.encode(
        message.offer,
        writer.uint32(10).fork()
      ).ldelim();
    }
    if (message.answer !== undefined) {
      SessionDescription.encode(
        message.answer,
        writer.uint32(18).fork()
      ).ldelim();
    }
    if (message.trickle !== undefined) {
      TrickleRequest.encode(message.trickle, writer.uint32(26).fork()).ldelim();
    }
    if (message.addTrack !== undefined) {
      AddTrackRequest.encode(
        message.addTrack,
        writer.uint32(34).fork()
      ).ldelim();
    }
    if (message.mute !== undefined) {
      MuteTrackRequest.encode(message.mute, writer.uint32(42).fork()).ldelim();
    }
    if (message.subscription !== undefined) {
      UpdateSubscription.encode(
        message.subscription,
        writer.uint32(50).fork()
      ).ldelim();
    }
    if (message.trackSetting !== undefined) {
      UpdateTrackSettings.encode(
        message.trackSetting,
        writer.uint32(58).fork()
      ).ldelim();
    }
    if (message.leave !== undefined) {
      LeaveRequest.encode(message.leave, writer.uint32(66).fork()).ldelim();
    }
    if (message.simulcast !== undefined) {
      SetSimulcastLayers.encode(
        message.simulcast,
        writer.uint32(74).fork()
      ).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SignalRequest {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSignalRequest } as SignalRequest;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.offer = SessionDescription.decode(reader, reader.uint32());
          break;
        case 2:
          message.answer = SessionDescription.decode(reader, reader.uint32());
          break;
        case 3:
          message.trickle = TrickleRequest.decode(reader, reader.uint32());
          break;
        case 4:
          message.addTrack = AddTrackRequest.decode(reader, reader.uint32());
          break;
        case 5:
          message.mute = MuteTrackRequest.decode(reader, reader.uint32());
          break;
        case 6:
          message.subscription = UpdateSubscription.decode(
            reader,
            reader.uint32()
          );
          break;
        case 7:
          message.trackSetting = UpdateTrackSettings.decode(
            reader,
            reader.uint32()
          );
          break;
        case 8:
          message.leave = LeaveRequest.decode(reader, reader.uint32());
          break;
        case 9:
          message.simulcast = SetSimulcastLayers.decode(
            reader,
            reader.uint32()
          );
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
    if (object.answer !== undefined && object.answer !== null) {
      message.answer = SessionDescription.fromJSON(object.answer);
    } else {
      message.answer = undefined;
    }
    if (object.trickle !== undefined && object.trickle !== null) {
      message.trickle = TrickleRequest.fromJSON(object.trickle);
    } else {
      message.trickle = undefined;
    }
    if (object.addTrack !== undefined && object.addTrack !== null) {
      message.addTrack = AddTrackRequest.fromJSON(object.addTrack);
    } else {
      message.addTrack = undefined;
    }
    if (object.mute !== undefined && object.mute !== null) {
      message.mute = MuteTrackRequest.fromJSON(object.mute);
    } else {
      message.mute = undefined;
    }
    if (object.subscription !== undefined && object.subscription !== null) {
      message.subscription = UpdateSubscription.fromJSON(object.subscription);
    } else {
      message.subscription = undefined;
    }
    if (object.trackSetting !== undefined && object.trackSetting !== null) {
      message.trackSetting = UpdateTrackSettings.fromJSON(object.trackSetting);
    } else {
      message.trackSetting = undefined;
    }
    if (object.leave !== undefined && object.leave !== null) {
      message.leave = LeaveRequest.fromJSON(object.leave);
    } else {
      message.leave = undefined;
    }
    if (object.simulcast !== undefined && object.simulcast !== null) {
      message.simulcast = SetSimulcastLayers.fromJSON(object.simulcast);
    } else {
      message.simulcast = undefined;
    }
    return message;
  },

  toJSON(message: SignalRequest): unknown {
    const obj: any = {};
    message.offer !== undefined &&
      (obj.offer = message.offer
        ? SessionDescription.toJSON(message.offer)
        : undefined);
    message.answer !== undefined &&
      (obj.answer = message.answer
        ? SessionDescription.toJSON(message.answer)
        : undefined);
    message.trickle !== undefined &&
      (obj.trickle = message.trickle
        ? TrickleRequest.toJSON(message.trickle)
        : undefined);
    message.addTrack !== undefined &&
      (obj.addTrack = message.addTrack
        ? AddTrackRequest.toJSON(message.addTrack)
        : undefined);
    message.mute !== undefined &&
      (obj.mute = message.mute
        ? MuteTrackRequest.toJSON(message.mute)
        : undefined);
    message.subscription !== undefined &&
      (obj.subscription = message.subscription
        ? UpdateSubscription.toJSON(message.subscription)
        : undefined);
    message.trackSetting !== undefined &&
      (obj.trackSetting = message.trackSetting
        ? UpdateTrackSettings.toJSON(message.trackSetting)
        : undefined);
    message.leave !== undefined &&
      (obj.leave = message.leave
        ? LeaveRequest.toJSON(message.leave)
        : undefined);
    message.simulcast !== undefined &&
      (obj.simulcast = message.simulcast
        ? SetSimulcastLayers.toJSON(message.simulcast)
        : undefined);
    return obj;
  },

  fromPartial(object: DeepPartial<SignalRequest>): SignalRequest {
    const message = { ...baseSignalRequest } as SignalRequest;
    if (object.offer !== undefined && object.offer !== null) {
      message.offer = SessionDescription.fromPartial(object.offer);
    } else {
      message.offer = undefined;
    }
    if (object.answer !== undefined && object.answer !== null) {
      message.answer = SessionDescription.fromPartial(object.answer);
    } else {
      message.answer = undefined;
    }
    if (object.trickle !== undefined && object.trickle !== null) {
      message.trickle = TrickleRequest.fromPartial(object.trickle);
    } else {
      message.trickle = undefined;
    }
    if (object.addTrack !== undefined && object.addTrack !== null) {
      message.addTrack = AddTrackRequest.fromPartial(object.addTrack);
    } else {
      message.addTrack = undefined;
    }
    if (object.mute !== undefined && object.mute !== null) {
      message.mute = MuteTrackRequest.fromPartial(object.mute);
    } else {
      message.mute = undefined;
    }
    if (object.subscription !== undefined && object.subscription !== null) {
      message.subscription = UpdateSubscription.fromPartial(
        object.subscription
      );
    } else {
      message.subscription = undefined;
    }
    if (object.trackSetting !== undefined && object.trackSetting !== null) {
      message.trackSetting = UpdateTrackSettings.fromPartial(
        object.trackSetting
      );
    } else {
      message.trackSetting = undefined;
    }
    if (object.leave !== undefined && object.leave !== null) {
      message.leave = LeaveRequest.fromPartial(object.leave);
    } else {
      message.leave = undefined;
    }
    if (object.simulcast !== undefined && object.simulcast !== null) {
      message.simulcast = SetSimulcastLayers.fromPartial(object.simulcast);
    } else {
      message.simulcast = undefined;
    }
    return message;
  },
};

const baseSignalResponse: object = {};

export const SignalResponse = {
  encode(
    message: SignalResponse,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.join !== undefined) {
      JoinResponse.encode(message.join, writer.uint32(10).fork()).ldelim();
    }
    if (message.answer !== undefined) {
      SessionDescription.encode(
        message.answer,
        writer.uint32(18).fork()
      ).ldelim();
    }
    if (message.offer !== undefined) {
      SessionDescription.encode(
        message.offer,
        writer.uint32(26).fork()
      ).ldelim();
    }
    if (message.trickle !== undefined) {
      TrickleRequest.encode(message.trickle, writer.uint32(34).fork()).ldelim();
    }
    if (message.update !== undefined) {
      ParticipantUpdate.encode(
        message.update,
        writer.uint32(42).fork()
      ).ldelim();
    }
    if (message.trackPublished !== undefined) {
      TrackPublishedResponse.encode(
        message.trackPublished,
        writer.uint32(50).fork()
      ).ldelim();
    }
    if (message.leave !== undefined) {
      LeaveRequest.encode(message.leave, writer.uint32(66).fork()).ldelim();
    }
    if (message.mute !== undefined) {
      MuteTrackRequest.encode(message.mute, writer.uint32(74).fork()).ldelim();
    }
    if (message.speakersChanged !== undefined) {
      SpeakersChanged.encode(
        message.speakersChanged,
        writer.uint32(82).fork()
      ).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SignalResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
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
          message.offer = SessionDescription.decode(reader, reader.uint32());
          break;
        case 4:
          message.trickle = TrickleRequest.decode(reader, reader.uint32());
          break;
        case 5:
          message.update = ParticipantUpdate.decode(reader, reader.uint32());
          break;
        case 6:
          message.trackPublished = TrackPublishedResponse.decode(
            reader,
            reader.uint32()
          );
          break;
        case 8:
          message.leave = LeaveRequest.decode(reader, reader.uint32());
          break;
        case 9:
          message.mute = MuteTrackRequest.decode(reader, reader.uint32());
          break;
        case 10:
          message.speakersChanged = SpeakersChanged.decode(
            reader,
            reader.uint32()
          );
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
    if (object.offer !== undefined && object.offer !== null) {
      message.offer = SessionDescription.fromJSON(object.offer);
    } else {
      message.offer = undefined;
    }
    if (object.trickle !== undefined && object.trickle !== null) {
      message.trickle = TrickleRequest.fromJSON(object.trickle);
    } else {
      message.trickle = undefined;
    }
    if (object.update !== undefined && object.update !== null) {
      message.update = ParticipantUpdate.fromJSON(object.update);
    } else {
      message.update = undefined;
    }
    if (object.trackPublished !== undefined && object.trackPublished !== null) {
      message.trackPublished = TrackPublishedResponse.fromJSON(
        object.trackPublished
      );
    } else {
      message.trackPublished = undefined;
    }
    if (object.leave !== undefined && object.leave !== null) {
      message.leave = LeaveRequest.fromJSON(object.leave);
    } else {
      message.leave = undefined;
    }
    if (object.mute !== undefined && object.mute !== null) {
      message.mute = MuteTrackRequest.fromJSON(object.mute);
    } else {
      message.mute = undefined;
    }
    if (
      object.speakersChanged !== undefined &&
      object.speakersChanged !== null
    ) {
      message.speakersChanged = SpeakersChanged.fromJSON(
        object.speakersChanged
      );
    } else {
      message.speakersChanged = undefined;
    }
    return message;
  },

  toJSON(message: SignalResponse): unknown {
    const obj: any = {};
    message.join !== undefined &&
      (obj.join = message.join ? JoinResponse.toJSON(message.join) : undefined);
    message.answer !== undefined &&
      (obj.answer = message.answer
        ? SessionDescription.toJSON(message.answer)
        : undefined);
    message.offer !== undefined &&
      (obj.offer = message.offer
        ? SessionDescription.toJSON(message.offer)
        : undefined);
    message.trickle !== undefined &&
      (obj.trickle = message.trickle
        ? TrickleRequest.toJSON(message.trickle)
        : undefined);
    message.update !== undefined &&
      (obj.update = message.update
        ? ParticipantUpdate.toJSON(message.update)
        : undefined);
    message.trackPublished !== undefined &&
      (obj.trackPublished = message.trackPublished
        ? TrackPublishedResponse.toJSON(message.trackPublished)
        : undefined);
    message.leave !== undefined &&
      (obj.leave = message.leave
        ? LeaveRequest.toJSON(message.leave)
        : undefined);
    message.mute !== undefined &&
      (obj.mute = message.mute
        ? MuteTrackRequest.toJSON(message.mute)
        : undefined);
    message.speakersChanged !== undefined &&
      (obj.speakersChanged = message.speakersChanged
        ? SpeakersChanged.toJSON(message.speakersChanged)
        : undefined);
    return obj;
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
    if (object.offer !== undefined && object.offer !== null) {
      message.offer = SessionDescription.fromPartial(object.offer);
    } else {
      message.offer = undefined;
    }
    if (object.trickle !== undefined && object.trickle !== null) {
      message.trickle = TrickleRequest.fromPartial(object.trickle);
    } else {
      message.trickle = undefined;
    }
    if (object.update !== undefined && object.update !== null) {
      message.update = ParticipantUpdate.fromPartial(object.update);
    } else {
      message.update = undefined;
    }
    if (object.trackPublished !== undefined && object.trackPublished !== null) {
      message.trackPublished = TrackPublishedResponse.fromPartial(
        object.trackPublished
      );
    } else {
      message.trackPublished = undefined;
    }
    if (object.leave !== undefined && object.leave !== null) {
      message.leave = LeaveRequest.fromPartial(object.leave);
    } else {
      message.leave = undefined;
    }
    if (object.mute !== undefined && object.mute !== null) {
      message.mute = MuteTrackRequest.fromPartial(object.mute);
    } else {
      message.mute = undefined;
    }
    if (
      object.speakersChanged !== undefined &&
      object.speakersChanged !== null
    ) {
      message.speakersChanged = SpeakersChanged.fromPartial(
        object.speakersChanged
      );
    } else {
      message.speakersChanged = undefined;
    }
    return message;
  },
};

const baseAddTrackRequest: object = {
  cid: "",
  name: "",
  type: 0,
  width: 0,
  height: 0,
  muted: false,
};

export const AddTrackRequest = {
  encode(
    message: AddTrackRequest,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.cid !== "") {
      writer.uint32(10).string(message.cid);
    }
    if (message.name !== "") {
      writer.uint32(18).string(message.name);
    }
    if (message.type !== 0) {
      writer.uint32(24).int32(message.type);
    }
    if (message.width !== 0) {
      writer.uint32(32).uint32(message.width);
    }
    if (message.height !== 0) {
      writer.uint32(40).uint32(message.height);
    }
    if (message.muted === true) {
      writer.uint32(48).bool(message.muted);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): AddTrackRequest {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseAddTrackRequest } as AddTrackRequest;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.cid = reader.string();
          break;
        case 2:
          message.name = reader.string();
          break;
        case 3:
          message.type = reader.int32() as any;
          break;
        case 4:
          message.width = reader.uint32();
          break;
        case 5:
          message.height = reader.uint32();
          break;
        case 6:
          message.muted = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): AddTrackRequest {
    const message = { ...baseAddTrackRequest } as AddTrackRequest;
    if (object.cid !== undefined && object.cid !== null) {
      message.cid = String(object.cid);
    } else {
      message.cid = "";
    }
    if (object.name !== undefined && object.name !== null) {
      message.name = String(object.name);
    } else {
      message.name = "";
    }
    if (object.type !== undefined && object.type !== null) {
      message.type = trackTypeFromJSON(object.type);
    } else {
      message.type = 0;
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
    if (object.muted !== undefined && object.muted !== null) {
      message.muted = Boolean(object.muted);
    } else {
      message.muted = false;
    }
    return message;
  },

  toJSON(message: AddTrackRequest): unknown {
    const obj: any = {};
    message.cid !== undefined && (obj.cid = message.cid);
    message.name !== undefined && (obj.name = message.name);
    message.type !== undefined && (obj.type = trackTypeToJSON(message.type));
    message.width !== undefined && (obj.width = message.width);
    message.height !== undefined && (obj.height = message.height);
    message.muted !== undefined && (obj.muted = message.muted);
    return obj;
  },

  fromPartial(object: DeepPartial<AddTrackRequest>): AddTrackRequest {
    const message = { ...baseAddTrackRequest } as AddTrackRequest;
    if (object.cid !== undefined && object.cid !== null) {
      message.cid = object.cid;
    } else {
      message.cid = "";
    }
    if (object.name !== undefined && object.name !== null) {
      message.name = object.name;
    } else {
      message.name = "";
    }
    if (object.type !== undefined && object.type !== null) {
      message.type = object.type;
    } else {
      message.type = 0;
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
    if (object.muted !== undefined && object.muted !== null) {
      message.muted = object.muted;
    } else {
      message.muted = false;
    }
    return message;
  },
};

const baseTrickleRequest: object = { candidateInit: "", target: 0 };

export const TrickleRequest = {
  encode(
    message: TrickleRequest,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.candidateInit !== "") {
      writer.uint32(10).string(message.candidateInit);
    }
    if (message.target !== 0) {
      writer.uint32(16).int32(message.target);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TrickleRequest {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseTrickleRequest } as TrickleRequest;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.candidateInit = reader.string();
          break;
        case 2:
          message.target = reader.int32() as any;
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): TrickleRequest {
    const message = { ...baseTrickleRequest } as TrickleRequest;
    if (object.candidateInit !== undefined && object.candidateInit !== null) {
      message.candidateInit = String(object.candidateInit);
    } else {
      message.candidateInit = "";
    }
    if (object.target !== undefined && object.target !== null) {
      message.target = signalTargetFromJSON(object.target);
    } else {
      message.target = 0;
    }
    return message;
  },

  toJSON(message: TrickleRequest): unknown {
    const obj: any = {};
    message.candidateInit !== undefined &&
      (obj.candidateInit = message.candidateInit);
    message.target !== undefined &&
      (obj.target = signalTargetToJSON(message.target));
    return obj;
  },

  fromPartial(object: DeepPartial<TrickleRequest>): TrickleRequest {
    const message = { ...baseTrickleRequest } as TrickleRequest;
    if (object.candidateInit !== undefined && object.candidateInit !== null) {
      message.candidateInit = object.candidateInit;
    } else {
      message.candidateInit = "";
    }
    if (object.target !== undefined && object.target !== null) {
      message.target = object.target;
    } else {
      message.target = 0;
    }
    return message;
  },
};

const baseMuteTrackRequest: object = { sid: "", muted: false };

export const MuteTrackRequest = {
  encode(
    message: MuteTrackRequest,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.sid !== "") {
      writer.uint32(10).string(message.sid);
    }
    if (message.muted === true) {
      writer.uint32(16).bool(message.muted);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): MuteTrackRequest {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseMuteTrackRequest } as MuteTrackRequest;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.sid = reader.string();
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

  fromJSON(object: any): MuteTrackRequest {
    const message = { ...baseMuteTrackRequest } as MuteTrackRequest;
    if (object.sid !== undefined && object.sid !== null) {
      message.sid = String(object.sid);
    } else {
      message.sid = "";
    }
    if (object.muted !== undefined && object.muted !== null) {
      message.muted = Boolean(object.muted);
    } else {
      message.muted = false;
    }
    return message;
  },

  toJSON(message: MuteTrackRequest): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.muted !== undefined && (obj.muted = message.muted);
    return obj;
  },

  fromPartial(object: DeepPartial<MuteTrackRequest>): MuteTrackRequest {
    const message = { ...baseMuteTrackRequest } as MuteTrackRequest;
    if (object.sid !== undefined && object.sid !== null) {
      message.sid = object.sid;
    } else {
      message.sid = "";
    }
    if (object.muted !== undefined && object.muted !== null) {
      message.muted = object.muted;
    } else {
      message.muted = false;
    }
    return message;
  },
};

const baseSetSimulcastLayers: object = { trackSid: "", layers: 0 };

export const SetSimulcastLayers = {
  encode(
    message: SetSimulcastLayers,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.trackSid !== "") {
      writer.uint32(10).string(message.trackSid);
    }
    writer.uint32(18).fork();
    for (const v of message.layers) {
      writer.int32(v);
    }
    writer.ldelim();
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SetSimulcastLayers {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSetSimulcastLayers } as SetSimulcastLayers;
    message.layers = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.trackSid = reader.string();
          break;
        case 2:
          if ((tag & 7) === 2) {
            const end2 = reader.uint32() + reader.pos;
            while (reader.pos < end2) {
              message.layers.push(reader.int32() as any);
            }
          } else {
            message.layers.push(reader.int32() as any);
          }
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SetSimulcastLayers {
    const message = { ...baseSetSimulcastLayers } as SetSimulcastLayers;
    message.layers = [];
    if (object.trackSid !== undefined && object.trackSid !== null) {
      message.trackSid = String(object.trackSid);
    } else {
      message.trackSid = "";
    }
    if (object.layers !== undefined && object.layers !== null) {
      for (const e of object.layers) {
        message.layers.push(videoQualityFromJSON(e));
      }
    }
    return message;
  },

  toJSON(message: SetSimulcastLayers): unknown {
    const obj: any = {};
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    if (message.layers) {
      obj.layers = message.layers.map((e) => videoQualityToJSON(e));
    } else {
      obj.layers = [];
    }
    return obj;
  },

  fromPartial(object: DeepPartial<SetSimulcastLayers>): SetSimulcastLayers {
    const message = { ...baseSetSimulcastLayers } as SetSimulcastLayers;
    message.layers = [];
    if (object.trackSid !== undefined && object.trackSid !== null) {
      message.trackSid = object.trackSid;
    } else {
      message.trackSid = "";
    }
    if (object.layers !== undefined && object.layers !== null) {
      for (const e of object.layers) {
        message.layers.push(e);
      }
    }
    return message;
  },
};

const baseJoinResponse: object = {
  serverVersion: "",
  subscriberPrimary: false,
};

export const JoinResponse = {
  encode(
    message: JoinResponse,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.room !== undefined) {
      Room.encode(message.room, writer.uint32(10).fork()).ldelim();
    }
    if (message.participant !== undefined) {
      ParticipantInfo.encode(
        message.participant,
        writer.uint32(18).fork()
      ).ldelim();
    }
    for (const v of message.otherParticipants) {
      ParticipantInfo.encode(v!, writer.uint32(26).fork()).ldelim();
    }
    if (message.serverVersion !== "") {
      writer.uint32(34).string(message.serverVersion);
    }
    for (const v of message.iceServers) {
      ICEServer.encode(v!, writer.uint32(42).fork()).ldelim();
    }
    if (message.subscriberPrimary === true) {
      writer.uint32(48).bool(message.subscriberPrimary);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): JoinResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseJoinResponse } as JoinResponse;
    message.otherParticipants = [];
    message.iceServers = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.room = Room.decode(reader, reader.uint32());
          break;
        case 2:
          message.participant = ParticipantInfo.decode(reader, reader.uint32());
          break;
        case 3:
          message.otherParticipants.push(
            ParticipantInfo.decode(reader, reader.uint32())
          );
          break;
        case 4:
          message.serverVersion = reader.string();
          break;
        case 5:
          message.iceServers.push(ICEServer.decode(reader, reader.uint32()));
          break;
        case 6:
          message.subscriberPrimary = reader.bool();
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
    message.iceServers = [];
    if (object.room !== undefined && object.room !== null) {
      message.room = Room.fromJSON(object.room);
    } else {
      message.room = undefined;
    }
    if (object.participant !== undefined && object.participant !== null) {
      message.participant = ParticipantInfo.fromJSON(object.participant);
    } else {
      message.participant = undefined;
    }
    if (
      object.otherParticipants !== undefined &&
      object.otherParticipants !== null
    ) {
      for (const e of object.otherParticipants) {
        message.otherParticipants.push(ParticipantInfo.fromJSON(e));
      }
    }
    if (object.serverVersion !== undefined && object.serverVersion !== null) {
      message.serverVersion = String(object.serverVersion);
    } else {
      message.serverVersion = "";
    }
    if (object.iceServers !== undefined && object.iceServers !== null) {
      for (const e of object.iceServers) {
        message.iceServers.push(ICEServer.fromJSON(e));
      }
    }
    if (
      object.subscriberPrimary !== undefined &&
      object.subscriberPrimary !== null
    ) {
      message.subscriberPrimary = Boolean(object.subscriberPrimary);
    } else {
      message.subscriberPrimary = false;
    }
    return message;
  },

  toJSON(message: JoinResponse): unknown {
    const obj: any = {};
    message.room !== undefined &&
      (obj.room = message.room ? Room.toJSON(message.room) : undefined);
    message.participant !== undefined &&
      (obj.participant = message.participant
        ? ParticipantInfo.toJSON(message.participant)
        : undefined);
    if (message.otherParticipants) {
      obj.otherParticipants = message.otherParticipants.map((e) =>
        e ? ParticipantInfo.toJSON(e) : undefined
      );
    } else {
      obj.otherParticipants = [];
    }
    message.serverVersion !== undefined &&
      (obj.serverVersion = message.serverVersion);
    if (message.iceServers) {
      obj.iceServers = message.iceServers.map((e) =>
        e ? ICEServer.toJSON(e) : undefined
      );
    } else {
      obj.iceServers = [];
    }
    message.subscriberPrimary !== undefined &&
      (obj.subscriberPrimary = message.subscriberPrimary);
    return obj;
  },

  fromPartial(object: DeepPartial<JoinResponse>): JoinResponse {
    const message = { ...baseJoinResponse } as JoinResponse;
    message.otherParticipants = [];
    message.iceServers = [];
    if (object.room !== undefined && object.room !== null) {
      message.room = Room.fromPartial(object.room);
    } else {
      message.room = undefined;
    }
    if (object.participant !== undefined && object.participant !== null) {
      message.participant = ParticipantInfo.fromPartial(object.participant);
    } else {
      message.participant = undefined;
    }
    if (
      object.otherParticipants !== undefined &&
      object.otherParticipants !== null
    ) {
      for (const e of object.otherParticipants) {
        message.otherParticipants.push(ParticipantInfo.fromPartial(e));
      }
    }
    if (object.serverVersion !== undefined && object.serverVersion !== null) {
      message.serverVersion = object.serverVersion;
    } else {
      message.serverVersion = "";
    }
    if (object.iceServers !== undefined && object.iceServers !== null) {
      for (const e of object.iceServers) {
        message.iceServers.push(ICEServer.fromPartial(e));
      }
    }
    if (
      object.subscriberPrimary !== undefined &&
      object.subscriberPrimary !== null
    ) {
      message.subscriberPrimary = object.subscriberPrimary;
    } else {
      message.subscriberPrimary = false;
    }
    return message;
  },
};

const baseTrackPublishedResponse: object = { cid: "" };

export const TrackPublishedResponse = {
  encode(
    message: TrackPublishedResponse,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.cid !== "") {
      writer.uint32(10).string(message.cid);
    }
    if (message.track !== undefined) {
      TrackInfo.encode(message.track, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(
    input: _m0.Reader | Uint8Array,
    length?: number
  ): TrackPublishedResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseTrackPublishedResponse } as TrackPublishedResponse;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.cid = reader.string();
          break;
        case 2:
          message.track = TrackInfo.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): TrackPublishedResponse {
    const message = { ...baseTrackPublishedResponse } as TrackPublishedResponse;
    if (object.cid !== undefined && object.cid !== null) {
      message.cid = String(object.cid);
    } else {
      message.cid = "";
    }
    if (object.track !== undefined && object.track !== null) {
      message.track = TrackInfo.fromJSON(object.track);
    } else {
      message.track = undefined;
    }
    return message;
  },

  toJSON(message: TrackPublishedResponse): unknown {
    const obj: any = {};
    message.cid !== undefined && (obj.cid = message.cid);
    message.track !== undefined &&
      (obj.track = message.track ? TrackInfo.toJSON(message.track) : undefined);
    return obj;
  },

  fromPartial(
    object: DeepPartial<TrackPublishedResponse>
  ): TrackPublishedResponse {
    const message = { ...baseTrackPublishedResponse } as TrackPublishedResponse;
    if (object.cid !== undefined && object.cid !== null) {
      message.cid = object.cid;
    } else {
      message.cid = "";
    }
    if (object.track !== undefined && object.track !== null) {
      message.track = TrackInfo.fromPartial(object.track);
    } else {
      message.track = undefined;
    }
    return message;
  },
};

const baseSessionDescription: object = { type: "", sdp: "" };

export const SessionDescription = {
  encode(
    message: SessionDescription,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.type !== "") {
      writer.uint32(10).string(message.type);
    }
    if (message.sdp !== "") {
      writer.uint32(18).string(message.sdp);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SessionDescription {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
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

  toJSON(message: SessionDescription): unknown {
    const obj: any = {};
    message.type !== undefined && (obj.type = message.type);
    message.sdp !== undefined && (obj.sdp = message.sdp);
    return obj;
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
};

const baseParticipantUpdate: object = {};

export const ParticipantUpdate = {
  encode(
    message: ParticipantUpdate,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    for (const v of message.participants) {
      ParticipantInfo.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ParticipantUpdate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseParticipantUpdate } as ParticipantUpdate;
    message.participants = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.participants.push(
            ParticipantInfo.decode(reader, reader.uint32())
          );
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

  toJSON(message: ParticipantUpdate): unknown {
    const obj: any = {};
    if (message.participants) {
      obj.participants = message.participants.map((e) =>
        e ? ParticipantInfo.toJSON(e) : undefined
      );
    } else {
      obj.participants = [];
    }
    return obj;
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
};

const baseUpdateSubscription: object = { trackSids: "", subscribe: false };

export const UpdateSubscription = {
  encode(
    message: UpdateSubscription,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    for (const v of message.trackSids) {
      writer.uint32(10).string(v!);
    }
    if (message.subscribe === true) {
      writer.uint32(16).bool(message.subscribe);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): UpdateSubscription {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseUpdateSubscription } as UpdateSubscription;
    message.trackSids = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.trackSids.push(reader.string());
          break;
        case 2:
          message.subscribe = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): UpdateSubscription {
    const message = { ...baseUpdateSubscription } as UpdateSubscription;
    message.trackSids = [];
    if (object.trackSids !== undefined && object.trackSids !== null) {
      for (const e of object.trackSids) {
        message.trackSids.push(String(e));
      }
    }
    if (object.subscribe !== undefined && object.subscribe !== null) {
      message.subscribe = Boolean(object.subscribe);
    } else {
      message.subscribe = false;
    }
    return message;
  },

  toJSON(message: UpdateSubscription): unknown {
    const obj: any = {};
    if (message.trackSids) {
      obj.trackSids = message.trackSids.map((e) => e);
    } else {
      obj.trackSids = [];
    }
    message.subscribe !== undefined && (obj.subscribe = message.subscribe);
    return obj;
  },

  fromPartial(object: DeepPartial<UpdateSubscription>): UpdateSubscription {
    const message = { ...baseUpdateSubscription } as UpdateSubscription;
    message.trackSids = [];
    if (object.trackSids !== undefined && object.trackSids !== null) {
      for (const e of object.trackSids) {
        message.trackSids.push(e);
      }
    }
    if (object.subscribe !== undefined && object.subscribe !== null) {
      message.subscribe = object.subscribe;
    } else {
      message.subscribe = false;
    }
    return message;
  },
};

const baseUpdateTrackSettings: object = {
  trackSids: "",
  disabled: false,
  quality: 0,
};

export const UpdateTrackSettings = {
  encode(
    message: UpdateTrackSettings,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    for (const v of message.trackSids) {
      writer.uint32(10).string(v!);
    }
    if (message.disabled === true) {
      writer.uint32(24).bool(message.disabled);
    }
    if (message.quality !== 0) {
      writer.uint32(32).int32(message.quality);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): UpdateTrackSettings {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseUpdateTrackSettings } as UpdateTrackSettings;
    message.trackSids = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.trackSids.push(reader.string());
          break;
        case 3:
          message.disabled = reader.bool();
          break;
        case 4:
          message.quality = reader.int32() as any;
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): UpdateTrackSettings {
    const message = { ...baseUpdateTrackSettings } as UpdateTrackSettings;
    message.trackSids = [];
    if (object.trackSids !== undefined && object.trackSids !== null) {
      for (const e of object.trackSids) {
        message.trackSids.push(String(e));
      }
    }
    if (object.disabled !== undefined && object.disabled !== null) {
      message.disabled = Boolean(object.disabled);
    } else {
      message.disabled = false;
    }
    if (object.quality !== undefined && object.quality !== null) {
      message.quality = videoQualityFromJSON(object.quality);
    } else {
      message.quality = 0;
    }
    return message;
  },

  toJSON(message: UpdateTrackSettings): unknown {
    const obj: any = {};
    if (message.trackSids) {
      obj.trackSids = message.trackSids.map((e) => e);
    } else {
      obj.trackSids = [];
    }
    message.disabled !== undefined && (obj.disabled = message.disabled);
    message.quality !== undefined &&
      (obj.quality = videoQualityToJSON(message.quality));
    return obj;
  },

  fromPartial(object: DeepPartial<UpdateTrackSettings>): UpdateTrackSettings {
    const message = { ...baseUpdateTrackSettings } as UpdateTrackSettings;
    message.trackSids = [];
    if (object.trackSids !== undefined && object.trackSids !== null) {
      for (const e of object.trackSids) {
        message.trackSids.push(e);
      }
    }
    if (object.disabled !== undefined && object.disabled !== null) {
      message.disabled = object.disabled;
    } else {
      message.disabled = false;
    }
    if (object.quality !== undefined && object.quality !== null) {
      message.quality = object.quality;
    } else {
      message.quality = 0;
    }
    return message;
  },
};

const baseLeaveRequest: object = { canReconnect: false };

export const LeaveRequest = {
  encode(
    message: LeaveRequest,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.canReconnect === true) {
      writer.uint32(8).bool(message.canReconnect);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): LeaveRequest {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseLeaveRequest } as LeaveRequest;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.canReconnect = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): LeaveRequest {
    const message = { ...baseLeaveRequest } as LeaveRequest;
    if (object.canReconnect !== undefined && object.canReconnect !== null) {
      message.canReconnect = Boolean(object.canReconnect);
    } else {
      message.canReconnect = false;
    }
    return message;
  },

  toJSON(message: LeaveRequest): unknown {
    const obj: any = {};
    message.canReconnect !== undefined &&
      (obj.canReconnect = message.canReconnect);
    return obj;
  },

  fromPartial(object: DeepPartial<LeaveRequest>): LeaveRequest {
    const message = { ...baseLeaveRequest } as LeaveRequest;
    if (object.canReconnect !== undefined && object.canReconnect !== null) {
      message.canReconnect = object.canReconnect;
    } else {
      message.canReconnect = false;
    }
    return message;
  },
};

const baseICEServer: object = { urls: "", username: "", credential: "" };

export const ICEServer = {
  encode(
    message: ICEServer,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    for (const v of message.urls) {
      writer.uint32(10).string(v!);
    }
    if (message.username !== "") {
      writer.uint32(18).string(message.username);
    }
    if (message.credential !== "") {
      writer.uint32(26).string(message.credential);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ICEServer {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseICEServer } as ICEServer;
    message.urls = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.urls.push(reader.string());
          break;
        case 2:
          message.username = reader.string();
          break;
        case 3:
          message.credential = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ICEServer {
    const message = { ...baseICEServer } as ICEServer;
    message.urls = [];
    if (object.urls !== undefined && object.urls !== null) {
      for (const e of object.urls) {
        message.urls.push(String(e));
      }
    }
    if (object.username !== undefined && object.username !== null) {
      message.username = String(object.username);
    } else {
      message.username = "";
    }
    if (object.credential !== undefined && object.credential !== null) {
      message.credential = String(object.credential);
    } else {
      message.credential = "";
    }
    return message;
  },

  toJSON(message: ICEServer): unknown {
    const obj: any = {};
    if (message.urls) {
      obj.urls = message.urls.map((e) => e);
    } else {
      obj.urls = [];
    }
    message.username !== undefined && (obj.username = message.username);
    message.credential !== undefined && (obj.credential = message.credential);
    return obj;
  },

  fromPartial(object: DeepPartial<ICEServer>): ICEServer {
    const message = { ...baseICEServer } as ICEServer;
    message.urls = [];
    if (object.urls !== undefined && object.urls !== null) {
      for (const e of object.urls) {
        message.urls.push(e);
      }
    }
    if (object.username !== undefined && object.username !== null) {
      message.username = object.username;
    } else {
      message.username = "";
    }
    if (object.credential !== undefined && object.credential !== null) {
      message.credential = object.credential;
    } else {
      message.credential = "";
    }
    return message;
  },
};

const baseSpeakersChanged: object = {};

export const SpeakersChanged = {
  encode(
    message: SpeakersChanged,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    for (const v of message.speakers) {
      SpeakerInfo.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SpeakersChanged {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSpeakersChanged } as SpeakersChanged;
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

  fromJSON(object: any): SpeakersChanged {
    const message = { ...baseSpeakersChanged } as SpeakersChanged;
    message.speakers = [];
    if (object.speakers !== undefined && object.speakers !== null) {
      for (const e of object.speakers) {
        message.speakers.push(SpeakerInfo.fromJSON(e));
      }
    }
    return message;
  },

  toJSON(message: SpeakersChanged): unknown {
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

  fromPartial(object: DeepPartial<SpeakersChanged>): SpeakersChanged {
    const message = { ...baseSpeakersChanged } as SpeakersChanged;
    message.speakers = [];
    if (object.speakers !== undefined && object.speakers !== null) {
      for (const e of object.speakers) {
        message.speakers.push(SpeakerInfo.fromPartial(e));
      }
    }
    return message;
  },
};

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

if (_m0.util.Long !== Long) {
  _m0.util.Long = Long as any;
  _m0.configure();
}
