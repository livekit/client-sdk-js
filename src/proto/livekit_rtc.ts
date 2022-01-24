/* eslint-disable */
import Long from "long";
import _m0 from "protobufjs/minimal";
import {
  TrackType,
  TrackSource,
  Room,
  ParticipantInfo,
  TrackInfo,
  VideoQuality,
  ConnectionQuality,
  VideoLayer,
  ParticipantTracks,
  SpeakerInfo,
  trackTypeFromJSON,
  trackSourceFromJSON,
  trackTypeToJSON,
  trackSourceToJSON,
  videoQualityFromJSON,
  videoQualityToJSON,
  connectionQualityFromJSON,
  connectionQualityToJSON,
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

export enum StreamState {
  ACTIVE = 0,
  PAUSED = 1,
  UNRECOGNIZED = -1,
}

export function streamStateFromJSON(object: any): StreamState {
  switch (object) {
    case 0:
    case "ACTIVE":
      return StreamState.ACTIVE;
    case 1:
    case "PAUSED":
      return StreamState.PAUSED;
    case -1:
    case "UNRECOGNIZED":
    default:
      return StreamState.UNRECOGNIZED;
  }
}

export function streamStateToJSON(object: StreamState): string {
  switch (object) {
    case StreamState.ACTIVE:
      return "ACTIVE";
    case StreamState.PAUSED:
      return "PAUSED";
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
  /**
   * Set active published layers, deprecated in favor of automatic tracking
   *    SetSimulcastLayers simulcast = 9;
   * Update published video layers
   */
  updateLayers?: UpdateVideoLayers | undefined;
  /** Update subscriber permissions */
  subscriptionPermission?: SubscriptionPermission | undefined;
  /** sync client's subscribe state to server during reconnect */
  syncState?: SyncState | undefined;
  /** Simulate conditions, for client validations */
  simulate?: SimulateScenario | undefined;
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
  /** sent when metadata of the room has changed */
  roomUpdate?: RoomUpdate | undefined;
  /** when connection quality changed */
  connectionQuality?: ConnectionQualityUpdate | undefined;
  /**
   * when streamed tracks state changed, used to notify when any of the streams were paused due to
   * congestion
   */
  streamStateUpdate?: StreamStateUpdate | undefined;
  /** when max subscribe quality changed, used by dynamic broadcasting to disable unused layers */
  subscribedQualityUpdate?: SubscribedQualityUpdate | undefined;
  /** when subscription permission changed */
  subscriptionPermissionUpdate?: SubscriptionPermissionUpdate | undefined;
  /** update the token the client was using, to prevent an active client from using an expired token */
  refreshToken: string | undefined;
}

export interface AddTrackRequest {
  /** client ID of track, to match it when RTC track is received */
  cid: string;
  name: string;
  type: TrackType;
  /** to be deprecated in favor of layers */
  width: number;
  height: number;
  /** true to add track and initialize to muted */
  muted: boolean;
  /** true if DTX (Discontinuous Transmission) is disabled for audio */
  disableDtx: boolean;
  source: TrackSource;
  layers: VideoLayer[];
}

export interface TrickleRequest {
  candidateInit: string;
  target: SignalTarget;
}

export interface MuteTrackRequest {
  sid: string;
  muted: boolean;
}

export interface JoinResponse {
  room?: Room;
  participant?: ParticipantInfo;
  otherParticipants: ParticipantInfo[];
  serverVersion: string;
  iceServers: ICEServer[];
  /** use subscriber as the primary PeerConnection */
  subscriberPrimary: boolean;
  /**
   * when the current server isn't available, return alternate url to retry connection
   * when this is set, the other fields will be largely empty
   */
  alternativeUrl: string;
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
  participantTracks: ParticipantTracks[];
}

export interface UpdateTrackSettings {
  trackSids: string[];
  /** when true, the track is placed in a paused state, with no new data returned */
  disabled: boolean;
  /** deprecated in favor of width & height */
  quality: VideoQuality;
  /** for video, width to receive */
  width: number;
  /** for video, height to receive */
  height: number;
}

export interface LeaveRequest {
  /**
   * sent when server initiates the disconnect due to server-restart
   * indicates clients should attempt full-reconnect sequence
   */
  canReconnect: boolean;
}

/** message to indicate published video track dimensions are changing */
export interface UpdateVideoLayers {
  trackSid: string;
  layers: VideoLayer[];
}

export interface ICEServer {
  urls: string[];
  username: string;
  credential: string;
}

export interface SpeakersChanged {
  speakers: SpeakerInfo[];
}

export interface RoomUpdate {
  room?: Room;
}

export interface ConnectionQualityInfo {
  participantSid: string;
  quality: ConnectionQuality;
  score: number;
}

export interface ConnectionQualityUpdate {
  updates: ConnectionQualityInfo[];
}

export interface StreamStateInfo {
  participantSid: string;
  trackSid: string;
  state: StreamState;
}

export interface StreamStateUpdate {
  streamStates: StreamStateInfo[];
}

export interface SubscribedQuality {
  quality: VideoQuality;
  enabled: boolean;
}

export interface SubscribedQualityUpdate {
  trackSid: string;
  subscribedQualities: SubscribedQuality[];
}

export interface TrackPermission {
  participantSid: string;
  allTracks: boolean;
  trackSids: string[];
}

export interface SubscriptionPermission {
  allParticipants: boolean;
  trackPermissions: TrackPermission[];
}

export interface SubscriptionPermissionUpdate {
  participantSid: string;
  trackSid: string;
  allowed: boolean;
}

export interface SyncState {
  answer?: SessionDescription;
  subscription?: UpdateSubscription;
  publishTracks: TrackPublishedResponse[];
}

export interface SimulateScenario {
  /** simulate N seconds of speaker activity */
  speakerUpdate: number | undefined;
  /** simulate local node failure */
  nodeFailure: boolean | undefined;
  /** simulate migration */
  migration: boolean | undefined;
  /** server to send leave */
  serverLeave: boolean | undefined;
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
    if (message.updateLayers !== undefined) {
      UpdateVideoLayers.encode(
        message.updateLayers,
        writer.uint32(82).fork()
      ).ldelim();
    }
    if (message.subscriptionPermission !== undefined) {
      SubscriptionPermission.encode(
        message.subscriptionPermission,
        writer.uint32(90).fork()
      ).ldelim();
    }
    if (message.syncState !== undefined) {
      SyncState.encode(message.syncState, writer.uint32(98).fork()).ldelim();
    }
    if (message.simulate !== undefined) {
      SimulateScenario.encode(
        message.simulate,
        writer.uint32(106).fork()
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
        case 10:
          message.updateLayers = UpdateVideoLayers.decode(
            reader,
            reader.uint32()
          );
          break;
        case 11:
          message.subscriptionPermission = SubscriptionPermission.decode(
            reader,
            reader.uint32()
          );
          break;
        case 12:
          message.syncState = SyncState.decode(reader, reader.uint32());
          break;
        case 13:
          message.simulate = SimulateScenario.decode(reader, reader.uint32());
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
    if (object.updateLayers !== undefined && object.updateLayers !== null) {
      message.updateLayers = UpdateVideoLayers.fromJSON(object.updateLayers);
    } else {
      message.updateLayers = undefined;
    }
    if (
      object.subscriptionPermission !== undefined &&
      object.subscriptionPermission !== null
    ) {
      message.subscriptionPermission = SubscriptionPermission.fromJSON(
        object.subscriptionPermission
      );
    } else {
      message.subscriptionPermission = undefined;
    }
    if (object.syncState !== undefined && object.syncState !== null) {
      message.syncState = SyncState.fromJSON(object.syncState);
    } else {
      message.syncState = undefined;
    }
    if (object.simulate !== undefined && object.simulate !== null) {
      message.simulate = SimulateScenario.fromJSON(object.simulate);
    } else {
      message.simulate = undefined;
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
    message.updateLayers !== undefined &&
      (obj.updateLayers = message.updateLayers
        ? UpdateVideoLayers.toJSON(message.updateLayers)
        : undefined);
    message.subscriptionPermission !== undefined &&
      (obj.subscriptionPermission = message.subscriptionPermission
        ? SubscriptionPermission.toJSON(message.subscriptionPermission)
        : undefined);
    message.syncState !== undefined &&
      (obj.syncState = message.syncState
        ? SyncState.toJSON(message.syncState)
        : undefined);
    message.simulate !== undefined &&
      (obj.simulate = message.simulate
        ? SimulateScenario.toJSON(message.simulate)
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
    if (object.updateLayers !== undefined && object.updateLayers !== null) {
      message.updateLayers = UpdateVideoLayers.fromPartial(object.updateLayers);
    } else {
      message.updateLayers = undefined;
    }
    if (
      object.subscriptionPermission !== undefined &&
      object.subscriptionPermission !== null
    ) {
      message.subscriptionPermission = SubscriptionPermission.fromPartial(
        object.subscriptionPermission
      );
    } else {
      message.subscriptionPermission = undefined;
    }
    if (object.syncState !== undefined && object.syncState !== null) {
      message.syncState = SyncState.fromPartial(object.syncState);
    } else {
      message.syncState = undefined;
    }
    if (object.simulate !== undefined && object.simulate !== null) {
      message.simulate = SimulateScenario.fromPartial(object.simulate);
    } else {
      message.simulate = undefined;
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
    if (message.roomUpdate !== undefined) {
      RoomUpdate.encode(message.roomUpdate, writer.uint32(90).fork()).ldelim();
    }
    if (message.connectionQuality !== undefined) {
      ConnectionQualityUpdate.encode(
        message.connectionQuality,
        writer.uint32(98).fork()
      ).ldelim();
    }
    if (message.streamStateUpdate !== undefined) {
      StreamStateUpdate.encode(
        message.streamStateUpdate,
        writer.uint32(106).fork()
      ).ldelim();
    }
    if (message.subscribedQualityUpdate !== undefined) {
      SubscribedQualityUpdate.encode(
        message.subscribedQualityUpdate,
        writer.uint32(114).fork()
      ).ldelim();
    }
    if (message.subscriptionPermissionUpdate !== undefined) {
      SubscriptionPermissionUpdate.encode(
        message.subscriptionPermissionUpdate,
        writer.uint32(122).fork()
      ).ldelim();
    }
    if (message.refreshToken !== undefined) {
      writer.uint32(130).string(message.refreshToken);
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
        case 11:
          message.roomUpdate = RoomUpdate.decode(reader, reader.uint32());
          break;
        case 12:
          message.connectionQuality = ConnectionQualityUpdate.decode(
            reader,
            reader.uint32()
          );
          break;
        case 13:
          message.streamStateUpdate = StreamStateUpdate.decode(
            reader,
            reader.uint32()
          );
          break;
        case 14:
          message.subscribedQualityUpdate = SubscribedQualityUpdate.decode(
            reader,
            reader.uint32()
          );
          break;
        case 15:
          message.subscriptionPermissionUpdate =
            SubscriptionPermissionUpdate.decode(reader, reader.uint32());
          break;
        case 16:
          message.refreshToken = reader.string();
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
    if (object.roomUpdate !== undefined && object.roomUpdate !== null) {
      message.roomUpdate = RoomUpdate.fromJSON(object.roomUpdate);
    } else {
      message.roomUpdate = undefined;
    }
    if (
      object.connectionQuality !== undefined &&
      object.connectionQuality !== null
    ) {
      message.connectionQuality = ConnectionQualityUpdate.fromJSON(
        object.connectionQuality
      );
    } else {
      message.connectionQuality = undefined;
    }
    if (
      object.streamStateUpdate !== undefined &&
      object.streamStateUpdate !== null
    ) {
      message.streamStateUpdate = StreamStateUpdate.fromJSON(
        object.streamStateUpdate
      );
    } else {
      message.streamStateUpdate = undefined;
    }
    if (
      object.subscribedQualityUpdate !== undefined &&
      object.subscribedQualityUpdate !== null
    ) {
      message.subscribedQualityUpdate = SubscribedQualityUpdate.fromJSON(
        object.subscribedQualityUpdate
      );
    } else {
      message.subscribedQualityUpdate = undefined;
    }
    if (
      object.subscriptionPermissionUpdate !== undefined &&
      object.subscriptionPermissionUpdate !== null
    ) {
      message.subscriptionPermissionUpdate =
        SubscriptionPermissionUpdate.fromJSON(
          object.subscriptionPermissionUpdate
        );
    } else {
      message.subscriptionPermissionUpdate = undefined;
    }
    if (object.refreshToken !== undefined && object.refreshToken !== null) {
      message.refreshToken = String(object.refreshToken);
    } else {
      message.refreshToken = undefined;
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
    message.roomUpdate !== undefined &&
      (obj.roomUpdate = message.roomUpdate
        ? RoomUpdate.toJSON(message.roomUpdate)
        : undefined);
    message.connectionQuality !== undefined &&
      (obj.connectionQuality = message.connectionQuality
        ? ConnectionQualityUpdate.toJSON(message.connectionQuality)
        : undefined);
    message.streamStateUpdate !== undefined &&
      (obj.streamStateUpdate = message.streamStateUpdate
        ? StreamStateUpdate.toJSON(message.streamStateUpdate)
        : undefined);
    message.subscribedQualityUpdate !== undefined &&
      (obj.subscribedQualityUpdate = message.subscribedQualityUpdate
        ? SubscribedQualityUpdate.toJSON(message.subscribedQualityUpdate)
        : undefined);
    message.subscriptionPermissionUpdate !== undefined &&
      (obj.subscriptionPermissionUpdate = message.subscriptionPermissionUpdate
        ? SubscriptionPermissionUpdate.toJSON(
            message.subscriptionPermissionUpdate
          )
        : undefined);
    message.refreshToken !== undefined &&
      (obj.refreshToken = message.refreshToken);
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
    if (object.roomUpdate !== undefined && object.roomUpdate !== null) {
      message.roomUpdate = RoomUpdate.fromPartial(object.roomUpdate);
    } else {
      message.roomUpdate = undefined;
    }
    if (
      object.connectionQuality !== undefined &&
      object.connectionQuality !== null
    ) {
      message.connectionQuality = ConnectionQualityUpdate.fromPartial(
        object.connectionQuality
      );
    } else {
      message.connectionQuality = undefined;
    }
    if (
      object.streamStateUpdate !== undefined &&
      object.streamStateUpdate !== null
    ) {
      message.streamStateUpdate = StreamStateUpdate.fromPartial(
        object.streamStateUpdate
      );
    } else {
      message.streamStateUpdate = undefined;
    }
    if (
      object.subscribedQualityUpdate !== undefined &&
      object.subscribedQualityUpdate !== null
    ) {
      message.subscribedQualityUpdate = SubscribedQualityUpdate.fromPartial(
        object.subscribedQualityUpdate
      );
    } else {
      message.subscribedQualityUpdate = undefined;
    }
    if (
      object.subscriptionPermissionUpdate !== undefined &&
      object.subscriptionPermissionUpdate !== null
    ) {
      message.subscriptionPermissionUpdate =
        SubscriptionPermissionUpdate.fromPartial(
          object.subscriptionPermissionUpdate
        );
    } else {
      message.subscriptionPermissionUpdate = undefined;
    }
    message.refreshToken = object.refreshToken ?? undefined;
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
  disableDtx: false,
  source: 0,
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
    if (message.disableDtx === true) {
      writer.uint32(56).bool(message.disableDtx);
    }
    if (message.source !== 0) {
      writer.uint32(64).int32(message.source);
    }
    for (const v of message.layers) {
      VideoLayer.encode(v!, writer.uint32(74).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): AddTrackRequest {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseAddTrackRequest } as AddTrackRequest;
    message.layers = [];
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
        case 7:
          message.disableDtx = reader.bool();
          break;
        case 8:
          message.source = reader.int32() as any;
          break;
        case 9:
          message.layers.push(VideoLayer.decode(reader, reader.uint32()));
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
    message.layers = [];
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
    if (object.layers !== undefined && object.layers !== null) {
      for (const e of object.layers) {
        message.layers.push(VideoLayer.fromJSON(e));
      }
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
    message.disableDtx !== undefined && (obj.disableDtx = message.disableDtx);
    message.source !== undefined &&
      (obj.source = trackSourceToJSON(message.source));
    if (message.layers) {
      obj.layers = message.layers.map((e) =>
        e ? VideoLayer.toJSON(e) : undefined
      );
    } else {
      obj.layers = [];
    }
    return obj;
  },

  fromPartial(object: DeepPartial<AddTrackRequest>): AddTrackRequest {
    const message = { ...baseAddTrackRequest } as AddTrackRequest;
    message.cid = object.cid ?? "";
    message.name = object.name ?? "";
    message.type = object.type ?? 0;
    message.width = object.width ?? 0;
    message.height = object.height ?? 0;
    message.muted = object.muted ?? false;
    message.disableDtx = object.disableDtx ?? false;
    message.source = object.source ?? 0;
    message.layers = [];
    if (object.layers !== undefined && object.layers !== null) {
      for (const e of object.layers) {
        message.layers.push(VideoLayer.fromPartial(e));
      }
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
    message.candidateInit = object.candidateInit ?? "";
    message.target = object.target ?? 0;
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
    message.sid = object.sid ?? "";
    message.muted = object.muted ?? false;
    return message;
  },
};

const baseJoinResponse: object = {
  serverVersion: "",
  subscriberPrimary: false,
  alternativeUrl: "",
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
    if (message.alternativeUrl !== "") {
      writer.uint32(58).string(message.alternativeUrl);
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
        case 7:
          message.alternativeUrl = reader.string();
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
    if (object.alternativeUrl !== undefined && object.alternativeUrl !== null) {
      message.alternativeUrl = String(object.alternativeUrl);
    } else {
      message.alternativeUrl = "";
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
    message.alternativeUrl !== undefined &&
      (obj.alternativeUrl = message.alternativeUrl);
    return obj;
  },

  fromPartial(object: DeepPartial<JoinResponse>): JoinResponse {
    const message = { ...baseJoinResponse } as JoinResponse;
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
    message.otherParticipants = [];
    if (
      object.otherParticipants !== undefined &&
      object.otherParticipants !== null
    ) {
      for (const e of object.otherParticipants) {
        message.otherParticipants.push(ParticipantInfo.fromPartial(e));
      }
    }
    message.serverVersion = object.serverVersion ?? "";
    message.iceServers = [];
    if (object.iceServers !== undefined && object.iceServers !== null) {
      for (const e of object.iceServers) {
        message.iceServers.push(ICEServer.fromPartial(e));
      }
    }
    message.subscriberPrimary = object.subscriberPrimary ?? false;
    message.alternativeUrl = object.alternativeUrl ?? "";
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
    message.cid = object.cid ?? "";
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
    message.type = object.type ?? "";
    message.sdp = object.sdp ?? "";
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
    for (const v of message.participantTracks) {
      ParticipantTracks.encode(v!, writer.uint32(26).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): UpdateSubscription {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseUpdateSubscription } as UpdateSubscription;
    message.trackSids = [];
    message.participantTracks = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.trackSids.push(reader.string());
          break;
        case 2:
          message.subscribe = reader.bool();
          break;
        case 3:
          message.participantTracks.push(
            ParticipantTracks.decode(reader, reader.uint32())
          );
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
    message.participantTracks = [];
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
    if (
      object.participantTracks !== undefined &&
      object.participantTracks !== null
    ) {
      for (const e of object.participantTracks) {
        message.participantTracks.push(ParticipantTracks.fromJSON(e));
      }
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
    if (message.participantTracks) {
      obj.participantTracks = message.participantTracks.map((e) =>
        e ? ParticipantTracks.toJSON(e) : undefined
      );
    } else {
      obj.participantTracks = [];
    }
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
    message.subscribe = object.subscribe ?? false;
    message.participantTracks = [];
    if (
      object.participantTracks !== undefined &&
      object.participantTracks !== null
    ) {
      for (const e of object.participantTracks) {
        message.participantTracks.push(ParticipantTracks.fromPartial(e));
      }
    }
    return message;
  },
};

const baseUpdateTrackSettings: object = {
  trackSids: "",
  disabled: false,
  quality: 0,
  width: 0,
  height: 0,
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
    if (message.width !== 0) {
      writer.uint32(40).uint32(message.width);
    }
    if (message.height !== 0) {
      writer.uint32(48).uint32(message.height);
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
        case 5:
          message.width = reader.uint32();
          break;
        case 6:
          message.height = reader.uint32();
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
    message.width !== undefined && (obj.width = message.width);
    message.height !== undefined && (obj.height = message.height);
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
    message.disabled = object.disabled ?? false;
    message.quality = object.quality ?? 0;
    message.width = object.width ?? 0;
    message.height = object.height ?? 0;
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
    message.canReconnect = object.canReconnect ?? false;
    return message;
  },
};

const baseUpdateVideoLayers: object = { trackSid: "" };

export const UpdateVideoLayers = {
  encode(
    message: UpdateVideoLayers,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.trackSid !== "") {
      writer.uint32(10).string(message.trackSid);
    }
    for (const v of message.layers) {
      VideoLayer.encode(v!, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): UpdateVideoLayers {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseUpdateVideoLayers } as UpdateVideoLayers;
    message.layers = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.trackSid = reader.string();
          break;
        case 2:
          message.layers.push(VideoLayer.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): UpdateVideoLayers {
    const message = { ...baseUpdateVideoLayers } as UpdateVideoLayers;
    message.layers = [];
    if (object.trackSid !== undefined && object.trackSid !== null) {
      message.trackSid = String(object.trackSid);
    } else {
      message.trackSid = "";
    }
    if (object.layers !== undefined && object.layers !== null) {
      for (const e of object.layers) {
        message.layers.push(VideoLayer.fromJSON(e));
      }
    }
    return message;
  },

  toJSON(message: UpdateVideoLayers): unknown {
    const obj: any = {};
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    if (message.layers) {
      obj.layers = message.layers.map((e) =>
        e ? VideoLayer.toJSON(e) : undefined
      );
    } else {
      obj.layers = [];
    }
    return obj;
  },

  fromPartial(object: DeepPartial<UpdateVideoLayers>): UpdateVideoLayers {
    const message = { ...baseUpdateVideoLayers } as UpdateVideoLayers;
    message.trackSid = object.trackSid ?? "";
    message.layers = [];
    if (object.layers !== undefined && object.layers !== null) {
      for (const e of object.layers) {
        message.layers.push(VideoLayer.fromPartial(e));
      }
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
    message.username = object.username ?? "";
    message.credential = object.credential ?? "";
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

const baseRoomUpdate: object = {};

export const RoomUpdate = {
  encode(
    message: RoomUpdate,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.room !== undefined) {
      Room.encode(message.room, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): RoomUpdate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseRoomUpdate } as RoomUpdate;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.room = Room.decode(reader, reader.uint32());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): RoomUpdate {
    const message = { ...baseRoomUpdate } as RoomUpdate;
    if (object.room !== undefined && object.room !== null) {
      message.room = Room.fromJSON(object.room);
    } else {
      message.room = undefined;
    }
    return message;
  },

  toJSON(message: RoomUpdate): unknown {
    const obj: any = {};
    message.room !== undefined &&
      (obj.room = message.room ? Room.toJSON(message.room) : undefined);
    return obj;
  },

  fromPartial(object: DeepPartial<RoomUpdate>): RoomUpdate {
    const message = { ...baseRoomUpdate } as RoomUpdate;
    if (object.room !== undefined && object.room !== null) {
      message.room = Room.fromPartial(object.room);
    } else {
      message.room = undefined;
    }
    return message;
  },
};

const baseConnectionQualityInfo: object = {
  participantSid: "",
  quality: 0,
  score: 0,
};

export const ConnectionQualityInfo = {
  encode(
    message: ConnectionQualityInfo,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.participantSid !== "") {
      writer.uint32(10).string(message.participantSid);
    }
    if (message.quality !== 0) {
      writer.uint32(16).int32(message.quality);
    }
    if (message.score !== 0) {
      writer.uint32(29).float(message.score);
    }
    return writer;
  },

  decode(
    input: _m0.Reader | Uint8Array,
    length?: number
  ): ConnectionQualityInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseConnectionQualityInfo } as ConnectionQualityInfo;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.participantSid = reader.string();
          break;
        case 2:
          message.quality = reader.int32() as any;
          break;
        case 3:
          message.score = reader.float();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ConnectionQualityInfo {
    const message = { ...baseConnectionQualityInfo } as ConnectionQualityInfo;
    if (object.participantSid !== undefined && object.participantSid !== null) {
      message.participantSid = String(object.participantSid);
    } else {
      message.participantSid = "";
    }
    if (object.quality !== undefined && object.quality !== null) {
      message.quality = connectionQualityFromJSON(object.quality);
    } else {
      message.quality = 0;
    }
    if (object.score !== undefined && object.score !== null) {
      message.score = Number(object.score);
    } else {
      message.score = 0;
    }
    return message;
  },

  toJSON(message: ConnectionQualityInfo): unknown {
    const obj: any = {};
    message.participantSid !== undefined &&
      (obj.participantSid = message.participantSid);
    message.quality !== undefined &&
      (obj.quality = connectionQualityToJSON(message.quality));
    message.score !== undefined && (obj.score = message.score);
    return obj;
  },

  fromPartial(
    object: DeepPartial<ConnectionQualityInfo>
  ): ConnectionQualityInfo {
    const message = { ...baseConnectionQualityInfo } as ConnectionQualityInfo;
    message.participantSid = object.participantSid ?? "";
    message.quality = object.quality ?? 0;
    message.score = object.score ?? 0;
    return message;
  },
};

const baseConnectionQualityUpdate: object = {};

export const ConnectionQualityUpdate = {
  encode(
    message: ConnectionQualityUpdate,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    for (const v of message.updates) {
      ConnectionQualityInfo.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(
    input: _m0.Reader | Uint8Array,
    length?: number
  ): ConnectionQualityUpdate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = {
      ...baseConnectionQualityUpdate,
    } as ConnectionQualityUpdate;
    message.updates = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.updates.push(
            ConnectionQualityInfo.decode(reader, reader.uint32())
          );
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): ConnectionQualityUpdate {
    const message = {
      ...baseConnectionQualityUpdate,
    } as ConnectionQualityUpdate;
    message.updates = [];
    if (object.updates !== undefined && object.updates !== null) {
      for (const e of object.updates) {
        message.updates.push(ConnectionQualityInfo.fromJSON(e));
      }
    }
    return message;
  },

  toJSON(message: ConnectionQualityUpdate): unknown {
    const obj: any = {};
    if (message.updates) {
      obj.updates = message.updates.map((e) =>
        e ? ConnectionQualityInfo.toJSON(e) : undefined
      );
    } else {
      obj.updates = [];
    }
    return obj;
  },

  fromPartial(
    object: DeepPartial<ConnectionQualityUpdate>
  ): ConnectionQualityUpdate {
    const message = {
      ...baseConnectionQualityUpdate,
    } as ConnectionQualityUpdate;
    message.updates = [];
    if (object.updates !== undefined && object.updates !== null) {
      for (const e of object.updates) {
        message.updates.push(ConnectionQualityInfo.fromPartial(e));
      }
    }
    return message;
  },
};

const baseStreamStateInfo: object = {
  participantSid: "",
  trackSid: "",
  state: 0,
};

export const StreamStateInfo = {
  encode(
    message: StreamStateInfo,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.participantSid !== "") {
      writer.uint32(10).string(message.participantSid);
    }
    if (message.trackSid !== "") {
      writer.uint32(18).string(message.trackSid);
    }
    if (message.state !== 0) {
      writer.uint32(24).int32(message.state);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): StreamStateInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseStreamStateInfo } as StreamStateInfo;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.participantSid = reader.string();
          break;
        case 2:
          message.trackSid = reader.string();
          break;
        case 3:
          message.state = reader.int32() as any;
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): StreamStateInfo {
    const message = { ...baseStreamStateInfo } as StreamStateInfo;
    if (object.participantSid !== undefined && object.participantSid !== null) {
      message.participantSid = String(object.participantSid);
    } else {
      message.participantSid = "";
    }
    if (object.trackSid !== undefined && object.trackSid !== null) {
      message.trackSid = String(object.trackSid);
    } else {
      message.trackSid = "";
    }
    if (object.state !== undefined && object.state !== null) {
      message.state = streamStateFromJSON(object.state);
    } else {
      message.state = 0;
    }
    return message;
  },

  toJSON(message: StreamStateInfo): unknown {
    const obj: any = {};
    message.participantSid !== undefined &&
      (obj.participantSid = message.participantSid);
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    message.state !== undefined &&
      (obj.state = streamStateToJSON(message.state));
    return obj;
  },

  fromPartial(object: DeepPartial<StreamStateInfo>): StreamStateInfo {
    const message = { ...baseStreamStateInfo } as StreamStateInfo;
    message.participantSid = object.participantSid ?? "";
    message.trackSid = object.trackSid ?? "";
    message.state = object.state ?? 0;
    return message;
  },
};

const baseStreamStateUpdate: object = {};

export const StreamStateUpdate = {
  encode(
    message: StreamStateUpdate,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    for (const v of message.streamStates) {
      StreamStateInfo.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): StreamStateUpdate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseStreamStateUpdate } as StreamStateUpdate;
    message.streamStates = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.streamStates.push(
            StreamStateInfo.decode(reader, reader.uint32())
          );
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): StreamStateUpdate {
    const message = { ...baseStreamStateUpdate } as StreamStateUpdate;
    message.streamStates = [];
    if (object.streamStates !== undefined && object.streamStates !== null) {
      for (const e of object.streamStates) {
        message.streamStates.push(StreamStateInfo.fromJSON(e));
      }
    }
    return message;
  },

  toJSON(message: StreamStateUpdate): unknown {
    const obj: any = {};
    if (message.streamStates) {
      obj.streamStates = message.streamStates.map((e) =>
        e ? StreamStateInfo.toJSON(e) : undefined
      );
    } else {
      obj.streamStates = [];
    }
    return obj;
  },

  fromPartial(object: DeepPartial<StreamStateUpdate>): StreamStateUpdate {
    const message = { ...baseStreamStateUpdate } as StreamStateUpdate;
    message.streamStates = [];
    if (object.streamStates !== undefined && object.streamStates !== null) {
      for (const e of object.streamStates) {
        message.streamStates.push(StreamStateInfo.fromPartial(e));
      }
    }
    return message;
  },
};

const baseSubscribedQuality: object = { quality: 0, enabled: false };

export const SubscribedQuality = {
  encode(
    message: SubscribedQuality,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.quality !== 0) {
      writer.uint32(8).int32(message.quality);
    }
    if (message.enabled === true) {
      writer.uint32(16).bool(message.enabled);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SubscribedQuality {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSubscribedQuality } as SubscribedQuality;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.quality = reader.int32() as any;
          break;
        case 2:
          message.enabled = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SubscribedQuality {
    const message = { ...baseSubscribedQuality } as SubscribedQuality;
    if (object.quality !== undefined && object.quality !== null) {
      message.quality = videoQualityFromJSON(object.quality);
    } else {
      message.quality = 0;
    }
    if (object.enabled !== undefined && object.enabled !== null) {
      message.enabled = Boolean(object.enabled);
    } else {
      message.enabled = false;
    }
    return message;
  },

  toJSON(message: SubscribedQuality): unknown {
    const obj: any = {};
    message.quality !== undefined &&
      (obj.quality = videoQualityToJSON(message.quality));
    message.enabled !== undefined && (obj.enabled = message.enabled);
    return obj;
  },

  fromPartial(object: DeepPartial<SubscribedQuality>): SubscribedQuality {
    const message = { ...baseSubscribedQuality } as SubscribedQuality;
    message.quality = object.quality ?? 0;
    message.enabled = object.enabled ?? false;
    return message;
  },
};

const baseSubscribedQualityUpdate: object = { trackSid: "" };

export const SubscribedQualityUpdate = {
  encode(
    message: SubscribedQualityUpdate,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.trackSid !== "") {
      writer.uint32(10).string(message.trackSid);
    }
    for (const v of message.subscribedQualities) {
      SubscribedQuality.encode(v!, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(
    input: _m0.Reader | Uint8Array,
    length?: number
  ): SubscribedQualityUpdate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = {
      ...baseSubscribedQualityUpdate,
    } as SubscribedQualityUpdate;
    message.subscribedQualities = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.trackSid = reader.string();
          break;
        case 2:
          message.subscribedQualities.push(
            SubscribedQuality.decode(reader, reader.uint32())
          );
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SubscribedQualityUpdate {
    const message = {
      ...baseSubscribedQualityUpdate,
    } as SubscribedQualityUpdate;
    message.subscribedQualities = [];
    if (object.trackSid !== undefined && object.trackSid !== null) {
      message.trackSid = String(object.trackSid);
    } else {
      message.trackSid = "";
    }
    if (
      object.subscribedQualities !== undefined &&
      object.subscribedQualities !== null
    ) {
      for (const e of object.subscribedQualities) {
        message.subscribedQualities.push(SubscribedQuality.fromJSON(e));
      }
    }
    return message;
  },

  toJSON(message: SubscribedQualityUpdate): unknown {
    const obj: any = {};
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    if (message.subscribedQualities) {
      obj.subscribedQualities = message.subscribedQualities.map((e) =>
        e ? SubscribedQuality.toJSON(e) : undefined
      );
    } else {
      obj.subscribedQualities = [];
    }
    return obj;
  },

  fromPartial(
    object: DeepPartial<SubscribedQualityUpdate>
  ): SubscribedQualityUpdate {
    const message = {
      ...baseSubscribedQualityUpdate,
    } as SubscribedQualityUpdate;
    message.trackSid = object.trackSid ?? "";
    message.subscribedQualities = [];
    if (
      object.subscribedQualities !== undefined &&
      object.subscribedQualities !== null
    ) {
      for (const e of object.subscribedQualities) {
        message.subscribedQualities.push(SubscribedQuality.fromPartial(e));
      }
    }
    return message;
  },
};

const baseTrackPermission: object = {
  participantSid: "",
  allTracks: false,
  trackSids: "",
};

export const TrackPermission = {
  encode(
    message: TrackPermission,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.participantSid !== "") {
      writer.uint32(10).string(message.participantSid);
    }
    if (message.allTracks === true) {
      writer.uint32(16).bool(message.allTracks);
    }
    for (const v of message.trackSids) {
      writer.uint32(26).string(v!);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TrackPermission {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseTrackPermission } as TrackPermission;
    message.trackSids = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.participantSid = reader.string();
          break;
        case 2:
          message.allTracks = reader.bool();
          break;
        case 3:
          message.trackSids.push(reader.string());
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): TrackPermission {
    const message = { ...baseTrackPermission } as TrackPermission;
    message.trackSids = [];
    if (object.participantSid !== undefined && object.participantSid !== null) {
      message.participantSid = String(object.participantSid);
    } else {
      message.participantSid = "";
    }
    if (object.allTracks !== undefined && object.allTracks !== null) {
      message.allTracks = Boolean(object.allTracks);
    } else {
      message.allTracks = false;
    }
    if (object.trackSids !== undefined && object.trackSids !== null) {
      for (const e of object.trackSids) {
        message.trackSids.push(String(e));
      }
    }
    return message;
  },

  toJSON(message: TrackPermission): unknown {
    const obj: any = {};
    message.participantSid !== undefined &&
      (obj.participantSid = message.participantSid);
    message.allTracks !== undefined && (obj.allTracks = message.allTracks);
    if (message.trackSids) {
      obj.trackSids = message.trackSids.map((e) => e);
    } else {
      obj.trackSids = [];
    }
    return obj;
  },

  fromPartial(object: DeepPartial<TrackPermission>): TrackPermission {
    const message = { ...baseTrackPermission } as TrackPermission;
    message.participantSid = object.participantSid ?? "";
    message.allTracks = object.allTracks ?? false;
    message.trackSids = [];
    if (object.trackSids !== undefined && object.trackSids !== null) {
      for (const e of object.trackSids) {
        message.trackSids.push(e);
      }
    }
    return message;
  },
};

const baseSubscriptionPermission: object = { allParticipants: false };

export const SubscriptionPermission = {
  encode(
    message: SubscriptionPermission,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.allParticipants === true) {
      writer.uint32(8).bool(message.allParticipants);
    }
    for (const v of message.trackPermissions) {
      TrackPermission.encode(v!, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(
    input: _m0.Reader | Uint8Array,
    length?: number
  ): SubscriptionPermission {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSubscriptionPermission } as SubscriptionPermission;
    message.trackPermissions = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.allParticipants = reader.bool();
          break;
        case 2:
          message.trackPermissions.push(
            TrackPermission.decode(reader, reader.uint32())
          );
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SubscriptionPermission {
    const message = { ...baseSubscriptionPermission } as SubscriptionPermission;
    message.trackPermissions = [];
    if (
      object.allParticipants !== undefined &&
      object.allParticipants !== null
    ) {
      message.allParticipants = Boolean(object.allParticipants);
    } else {
      message.allParticipants = false;
    }
    if (
      object.trackPermissions !== undefined &&
      object.trackPermissions !== null
    ) {
      for (const e of object.trackPermissions) {
        message.trackPermissions.push(TrackPermission.fromJSON(e));
      }
    }
    return message;
  },

  toJSON(message: SubscriptionPermission): unknown {
    const obj: any = {};
    message.allParticipants !== undefined &&
      (obj.allParticipants = message.allParticipants);
    if (message.trackPermissions) {
      obj.trackPermissions = message.trackPermissions.map((e) =>
        e ? TrackPermission.toJSON(e) : undefined
      );
    } else {
      obj.trackPermissions = [];
    }
    return obj;
  },

  fromPartial(
    object: DeepPartial<SubscriptionPermission>
  ): SubscriptionPermission {
    const message = { ...baseSubscriptionPermission } as SubscriptionPermission;
    message.allParticipants = object.allParticipants ?? false;
    message.trackPermissions = [];
    if (
      object.trackPermissions !== undefined &&
      object.trackPermissions !== null
    ) {
      for (const e of object.trackPermissions) {
        message.trackPermissions.push(TrackPermission.fromPartial(e));
      }
    }
    return message;
  },
};

const baseSubscriptionPermissionUpdate: object = {
  participantSid: "",
  trackSid: "",
  allowed: false,
};

export const SubscriptionPermissionUpdate = {
  encode(
    message: SubscriptionPermissionUpdate,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.participantSid !== "") {
      writer.uint32(10).string(message.participantSid);
    }
    if (message.trackSid !== "") {
      writer.uint32(18).string(message.trackSid);
    }
    if (message.allowed === true) {
      writer.uint32(24).bool(message.allowed);
    }
    return writer;
  },

  decode(
    input: _m0.Reader | Uint8Array,
    length?: number
  ): SubscriptionPermissionUpdate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = {
      ...baseSubscriptionPermissionUpdate,
    } as SubscriptionPermissionUpdate;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.participantSid = reader.string();
          break;
        case 2:
          message.trackSid = reader.string();
          break;
        case 3:
          message.allowed = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SubscriptionPermissionUpdate {
    const message = {
      ...baseSubscriptionPermissionUpdate,
    } as SubscriptionPermissionUpdate;
    if (object.participantSid !== undefined && object.participantSid !== null) {
      message.participantSid = String(object.participantSid);
    } else {
      message.participantSid = "";
    }
    if (object.trackSid !== undefined && object.trackSid !== null) {
      message.trackSid = String(object.trackSid);
    } else {
      message.trackSid = "";
    }
    if (object.allowed !== undefined && object.allowed !== null) {
      message.allowed = Boolean(object.allowed);
    } else {
      message.allowed = false;
    }
    return message;
  },

  toJSON(message: SubscriptionPermissionUpdate): unknown {
    const obj: any = {};
    message.participantSid !== undefined &&
      (obj.participantSid = message.participantSid);
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    message.allowed !== undefined && (obj.allowed = message.allowed);
    return obj;
  },

  fromPartial(
    object: DeepPartial<SubscriptionPermissionUpdate>
  ): SubscriptionPermissionUpdate {
    const message = {
      ...baseSubscriptionPermissionUpdate,
    } as SubscriptionPermissionUpdate;
    message.participantSid = object.participantSid ?? "";
    message.trackSid = object.trackSid ?? "";
    message.allowed = object.allowed ?? false;
    return message;
  },
};

const baseSyncState: object = {};

export const SyncState = {
  encode(
    message: SyncState,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.answer !== undefined) {
      SessionDescription.encode(
        message.answer,
        writer.uint32(10).fork()
      ).ldelim();
    }
    if (message.subscription !== undefined) {
      UpdateSubscription.encode(
        message.subscription,
        writer.uint32(18).fork()
      ).ldelim();
    }
    for (const v of message.publishTracks) {
      TrackPublishedResponse.encode(v!, writer.uint32(26).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SyncState {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSyncState } as SyncState;
    message.publishTracks = [];
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.answer = SessionDescription.decode(reader, reader.uint32());
          break;
        case 2:
          message.subscription = UpdateSubscription.decode(
            reader,
            reader.uint32()
          );
          break;
        case 3:
          message.publishTracks.push(
            TrackPublishedResponse.decode(reader, reader.uint32())
          );
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SyncState {
    const message = { ...baseSyncState } as SyncState;
    message.publishTracks = [];
    if (object.answer !== undefined && object.answer !== null) {
      message.answer = SessionDescription.fromJSON(object.answer);
    } else {
      message.answer = undefined;
    }
    if (object.subscription !== undefined && object.subscription !== null) {
      message.subscription = UpdateSubscription.fromJSON(object.subscription);
    } else {
      message.subscription = undefined;
    }
    if (object.publishTracks !== undefined && object.publishTracks !== null) {
      for (const e of object.publishTracks) {
        message.publishTracks.push(TrackPublishedResponse.fromJSON(e));
      }
    }
    return message;
  },

  toJSON(message: SyncState): unknown {
    const obj: any = {};
    message.answer !== undefined &&
      (obj.answer = message.answer
        ? SessionDescription.toJSON(message.answer)
        : undefined);
    message.subscription !== undefined &&
      (obj.subscription = message.subscription
        ? UpdateSubscription.toJSON(message.subscription)
        : undefined);
    if (message.publishTracks) {
      obj.publishTracks = message.publishTracks.map((e) =>
        e ? TrackPublishedResponse.toJSON(e) : undefined
      );
    } else {
      obj.publishTracks = [];
    }
    return obj;
  },

  fromPartial(object: DeepPartial<SyncState>): SyncState {
    const message = { ...baseSyncState } as SyncState;
    if (object.answer !== undefined && object.answer !== null) {
      message.answer = SessionDescription.fromPartial(object.answer);
    } else {
      message.answer = undefined;
    }
    if (object.subscription !== undefined && object.subscription !== null) {
      message.subscription = UpdateSubscription.fromPartial(
        object.subscription
      );
    } else {
      message.subscription = undefined;
    }
    message.publishTracks = [];
    if (object.publishTracks !== undefined && object.publishTracks !== null) {
      for (const e of object.publishTracks) {
        message.publishTracks.push(TrackPublishedResponse.fromPartial(e));
      }
    }
    return message;
  },
};

const baseSimulateScenario: object = {};

export const SimulateScenario = {
  encode(
    message: SimulateScenario,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.speakerUpdate !== undefined) {
      writer.uint32(8).int32(message.speakerUpdate);
    }
    if (message.nodeFailure !== undefined) {
      writer.uint32(16).bool(message.nodeFailure);
    }
    if (message.migration !== undefined) {
      writer.uint32(24).bool(message.migration);
    }
    if (message.serverLeave !== undefined) {
      writer.uint32(32).bool(message.serverLeave);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SimulateScenario {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = { ...baseSimulateScenario } as SimulateScenario;
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.speakerUpdate = reader.int32();
          break;
        case 2:
          message.nodeFailure = reader.bool();
          break;
        case 3:
          message.migration = reader.bool();
          break;
        case 4:
          message.serverLeave = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SimulateScenario {
    const message = { ...baseSimulateScenario } as SimulateScenario;
    if (object.speakerUpdate !== undefined && object.speakerUpdate !== null) {
      message.speakerUpdate = Number(object.speakerUpdate);
    } else {
      message.speakerUpdate = undefined;
    }
    if (object.nodeFailure !== undefined && object.nodeFailure !== null) {
      message.nodeFailure = Boolean(object.nodeFailure);
    } else {
      message.nodeFailure = undefined;
    }
    if (object.migration !== undefined && object.migration !== null) {
      message.migration = Boolean(object.migration);
    } else {
      message.migration = undefined;
    }
    if (object.serverLeave !== undefined && object.serverLeave !== null) {
      message.serverLeave = Boolean(object.serverLeave);
    } else {
      message.serverLeave = undefined;
    }
    return message;
  },

  toJSON(message: SimulateScenario): unknown {
    const obj: any = {};
    message.speakerUpdate !== undefined &&
      (obj.speakerUpdate = message.speakerUpdate);
    message.nodeFailure !== undefined &&
      (obj.nodeFailure = message.nodeFailure);
    message.migration !== undefined && (obj.migration = message.migration);
    message.serverLeave !== undefined &&
      (obj.serverLeave = message.serverLeave);
    return obj;
  },

  fromPartial(object: DeepPartial<SimulateScenario>): SimulateScenario {
    const message = { ...baseSimulateScenario } as SimulateScenario;
    message.speakerUpdate = object.speakerUpdate ?? undefined;
    message.nodeFailure = object.nodeFailure ?? undefined;
    message.migration = object.migration ?? undefined;
    message.serverLeave = object.serverLeave ?? undefined;
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
