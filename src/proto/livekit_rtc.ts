/* eslint-disable */
import Long from "long";
import * as _m0 from "protobufjs/minimal";
import {
  TrackType,
  TrackSource,
  Room,
  ParticipantInfo,
  ClientConfiguration,
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
  /** server initiated track unpublish */
  trackUnpublished?: TrackUnpublishedResponse | undefined;
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
  clientConfiguration?: ClientConfiguration;
  serverRegion: string;
}

export interface TrackPublishedResponse {
  cid: string;
  track?: TrackInfo;
}

export interface TrackUnpublishedResponse {
  trackSid: string;
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
  dataChannels: DataChannelInfo[];
}

export interface DataChannelInfo {
  label: string;
  id: number;
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

function createBaseSignalRequest(): SignalRequest {
  return {
    offer: undefined,
    answer: undefined,
    trickle: undefined,
    addTrack: undefined,
    mute: undefined,
    subscription: undefined,
    trackSetting: undefined,
    leave: undefined,
    updateLayers: undefined,
    subscriptionPermission: undefined,
    syncState: undefined,
    simulate: undefined,
  };
}

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
    const message = createBaseSignalRequest();
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
    return {
      offer: isSet(object.offer)
        ? SessionDescription.fromJSON(object.offer)
        : undefined,
      answer: isSet(object.answer)
        ? SessionDescription.fromJSON(object.answer)
        : undefined,
      trickle: isSet(object.trickle)
        ? TrickleRequest.fromJSON(object.trickle)
        : undefined,
      addTrack: isSet(object.addTrack)
        ? AddTrackRequest.fromJSON(object.addTrack)
        : undefined,
      mute: isSet(object.mute)
        ? MuteTrackRequest.fromJSON(object.mute)
        : undefined,
      subscription: isSet(object.subscription)
        ? UpdateSubscription.fromJSON(object.subscription)
        : undefined,
      trackSetting: isSet(object.trackSetting)
        ? UpdateTrackSettings.fromJSON(object.trackSetting)
        : undefined,
      leave: isSet(object.leave)
        ? LeaveRequest.fromJSON(object.leave)
        : undefined,
      updateLayers: isSet(object.updateLayers)
        ? UpdateVideoLayers.fromJSON(object.updateLayers)
        : undefined,
      subscriptionPermission: isSet(object.subscriptionPermission)
        ? SubscriptionPermission.fromJSON(object.subscriptionPermission)
        : undefined,
      syncState: isSet(object.syncState)
        ? SyncState.fromJSON(object.syncState)
        : undefined,
      simulate: isSet(object.simulate)
        ? SimulateScenario.fromJSON(object.simulate)
        : undefined,
    };
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

  fromPartial<I extends Exact<DeepPartial<SignalRequest>, I>>(
    object: I
  ): SignalRequest {
    const message = createBaseSignalRequest();
    message.offer =
      object.offer !== undefined && object.offer !== null
        ? SessionDescription.fromPartial(object.offer)
        : undefined;
    message.answer =
      object.answer !== undefined && object.answer !== null
        ? SessionDescription.fromPartial(object.answer)
        : undefined;
    message.trickle =
      object.trickle !== undefined && object.trickle !== null
        ? TrickleRequest.fromPartial(object.trickle)
        : undefined;
    message.addTrack =
      object.addTrack !== undefined && object.addTrack !== null
        ? AddTrackRequest.fromPartial(object.addTrack)
        : undefined;
    message.mute =
      object.mute !== undefined && object.mute !== null
        ? MuteTrackRequest.fromPartial(object.mute)
        : undefined;
    message.subscription =
      object.subscription !== undefined && object.subscription !== null
        ? UpdateSubscription.fromPartial(object.subscription)
        : undefined;
    message.trackSetting =
      object.trackSetting !== undefined && object.trackSetting !== null
        ? UpdateTrackSettings.fromPartial(object.trackSetting)
        : undefined;
    message.leave =
      object.leave !== undefined && object.leave !== null
        ? LeaveRequest.fromPartial(object.leave)
        : undefined;
    message.updateLayers =
      object.updateLayers !== undefined && object.updateLayers !== null
        ? UpdateVideoLayers.fromPartial(object.updateLayers)
        : undefined;
    message.subscriptionPermission =
      object.subscriptionPermission !== undefined &&
      object.subscriptionPermission !== null
        ? SubscriptionPermission.fromPartial(object.subscriptionPermission)
        : undefined;
    message.syncState =
      object.syncState !== undefined && object.syncState !== null
        ? SyncState.fromPartial(object.syncState)
        : undefined;
    message.simulate =
      object.simulate !== undefined && object.simulate !== null
        ? SimulateScenario.fromPartial(object.simulate)
        : undefined;
    return message;
  },
};

function createBaseSignalResponse(): SignalResponse {
  return {
    join: undefined,
    answer: undefined,
    offer: undefined,
    trickle: undefined,
    update: undefined,
    trackPublished: undefined,
    leave: undefined,
    mute: undefined,
    speakersChanged: undefined,
    roomUpdate: undefined,
    connectionQuality: undefined,
    streamStateUpdate: undefined,
    subscribedQualityUpdate: undefined,
    subscriptionPermissionUpdate: undefined,
    refreshToken: undefined,
    trackUnpublished: undefined,
  };
}

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
    if (message.trackUnpublished !== undefined) {
      TrackUnpublishedResponse.encode(
        message.trackUnpublished,
        writer.uint32(138).fork()
      ).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SignalResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseSignalResponse();
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
        case 17:
          message.trackUnpublished = TrackUnpublishedResponse.decode(
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
    return {
      join: isSet(object.join) ? JoinResponse.fromJSON(object.join) : undefined,
      answer: isSet(object.answer)
        ? SessionDescription.fromJSON(object.answer)
        : undefined,
      offer: isSet(object.offer)
        ? SessionDescription.fromJSON(object.offer)
        : undefined,
      trickle: isSet(object.trickle)
        ? TrickleRequest.fromJSON(object.trickle)
        : undefined,
      update: isSet(object.update)
        ? ParticipantUpdate.fromJSON(object.update)
        : undefined,
      trackPublished: isSet(object.trackPublished)
        ? TrackPublishedResponse.fromJSON(object.trackPublished)
        : undefined,
      leave: isSet(object.leave)
        ? LeaveRequest.fromJSON(object.leave)
        : undefined,
      mute: isSet(object.mute)
        ? MuteTrackRequest.fromJSON(object.mute)
        : undefined,
      speakersChanged: isSet(object.speakersChanged)
        ? SpeakersChanged.fromJSON(object.speakersChanged)
        : undefined,
      roomUpdate: isSet(object.roomUpdate)
        ? RoomUpdate.fromJSON(object.roomUpdate)
        : undefined,
      connectionQuality: isSet(object.connectionQuality)
        ? ConnectionQualityUpdate.fromJSON(object.connectionQuality)
        : undefined,
      streamStateUpdate: isSet(object.streamStateUpdate)
        ? StreamStateUpdate.fromJSON(object.streamStateUpdate)
        : undefined,
      subscribedQualityUpdate: isSet(object.subscribedQualityUpdate)
        ? SubscribedQualityUpdate.fromJSON(object.subscribedQualityUpdate)
        : undefined,
      subscriptionPermissionUpdate: isSet(object.subscriptionPermissionUpdate)
        ? SubscriptionPermissionUpdate.fromJSON(
            object.subscriptionPermissionUpdate
          )
        : undefined,
      refreshToken: isSet(object.refreshToken)
        ? String(object.refreshToken)
        : undefined,
      trackUnpublished: isSet(object.trackUnpublished)
        ? TrackUnpublishedResponse.fromJSON(object.trackUnpublished)
        : undefined,
    };
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
    message.trackUnpublished !== undefined &&
      (obj.trackUnpublished = message.trackUnpublished
        ? TrackUnpublishedResponse.toJSON(message.trackUnpublished)
        : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SignalResponse>, I>>(
    object: I
  ): SignalResponse {
    const message = createBaseSignalResponse();
    message.join =
      object.join !== undefined && object.join !== null
        ? JoinResponse.fromPartial(object.join)
        : undefined;
    message.answer =
      object.answer !== undefined && object.answer !== null
        ? SessionDescription.fromPartial(object.answer)
        : undefined;
    message.offer =
      object.offer !== undefined && object.offer !== null
        ? SessionDescription.fromPartial(object.offer)
        : undefined;
    message.trickle =
      object.trickle !== undefined && object.trickle !== null
        ? TrickleRequest.fromPartial(object.trickle)
        : undefined;
    message.update =
      object.update !== undefined && object.update !== null
        ? ParticipantUpdate.fromPartial(object.update)
        : undefined;
    message.trackPublished =
      object.trackPublished !== undefined && object.trackPublished !== null
        ? TrackPublishedResponse.fromPartial(object.trackPublished)
        : undefined;
    message.leave =
      object.leave !== undefined && object.leave !== null
        ? LeaveRequest.fromPartial(object.leave)
        : undefined;
    message.mute =
      object.mute !== undefined && object.mute !== null
        ? MuteTrackRequest.fromPartial(object.mute)
        : undefined;
    message.speakersChanged =
      object.speakersChanged !== undefined && object.speakersChanged !== null
        ? SpeakersChanged.fromPartial(object.speakersChanged)
        : undefined;
    message.roomUpdate =
      object.roomUpdate !== undefined && object.roomUpdate !== null
        ? RoomUpdate.fromPartial(object.roomUpdate)
        : undefined;
    message.connectionQuality =
      object.connectionQuality !== undefined &&
      object.connectionQuality !== null
        ? ConnectionQualityUpdate.fromPartial(object.connectionQuality)
        : undefined;
    message.streamStateUpdate =
      object.streamStateUpdate !== undefined &&
      object.streamStateUpdate !== null
        ? StreamStateUpdate.fromPartial(object.streamStateUpdate)
        : undefined;
    message.subscribedQualityUpdate =
      object.subscribedQualityUpdate !== undefined &&
      object.subscribedQualityUpdate !== null
        ? SubscribedQualityUpdate.fromPartial(object.subscribedQualityUpdate)
        : undefined;
    message.subscriptionPermissionUpdate =
      object.subscriptionPermissionUpdate !== undefined &&
      object.subscriptionPermissionUpdate !== null
        ? SubscriptionPermissionUpdate.fromPartial(
            object.subscriptionPermissionUpdate
          )
        : undefined;
    message.refreshToken = object.refreshToken ?? undefined;
    message.trackUnpublished =
      object.trackUnpublished !== undefined && object.trackUnpublished !== null
        ? TrackUnpublishedResponse.fromPartial(object.trackUnpublished)
        : undefined;
    return message;
  },
};

function createBaseAddTrackRequest(): AddTrackRequest {
  return {
    cid: "",
    name: "",
    type: 0,
    width: 0,
    height: 0,
    muted: false,
    disableDtx: false,
    source: 0,
    layers: [],
  };
}

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
    const message = createBaseAddTrackRequest();
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
    return {
      cid: isSet(object.cid) ? String(object.cid) : "",
      name: isSet(object.name) ? String(object.name) : "",
      type: isSet(object.type) ? trackTypeFromJSON(object.type) : 0,
      width: isSet(object.width) ? Number(object.width) : 0,
      height: isSet(object.height) ? Number(object.height) : 0,
      muted: isSet(object.muted) ? Boolean(object.muted) : false,
      disableDtx: isSet(object.disableDtx) ? Boolean(object.disableDtx) : false,
      source: isSet(object.source) ? trackSourceFromJSON(object.source) : 0,
      layers: Array.isArray(object?.layers)
        ? object.layers.map((e: any) => VideoLayer.fromJSON(e))
        : [],
    };
  },

  toJSON(message: AddTrackRequest): unknown {
    const obj: any = {};
    message.cid !== undefined && (obj.cid = message.cid);
    message.name !== undefined && (obj.name = message.name);
    message.type !== undefined && (obj.type = trackTypeToJSON(message.type));
    message.width !== undefined && (obj.width = Math.round(message.width));
    message.height !== undefined && (obj.height = Math.round(message.height));
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

  fromPartial<I extends Exact<DeepPartial<AddTrackRequest>, I>>(
    object: I
  ): AddTrackRequest {
    const message = createBaseAddTrackRequest();
    message.cid = object.cid ?? "";
    message.name = object.name ?? "";
    message.type = object.type ?? 0;
    message.width = object.width ?? 0;
    message.height = object.height ?? 0;
    message.muted = object.muted ?? false;
    message.disableDtx = object.disableDtx ?? false;
    message.source = object.source ?? 0;
    message.layers = object.layers?.map((e) => VideoLayer.fromPartial(e)) || [];
    return message;
  },
};

function createBaseTrickleRequest(): TrickleRequest {
  return { candidateInit: "", target: 0 };
}

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
    const message = createBaseTrickleRequest();
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
    return {
      candidateInit: isSet(object.candidateInit)
        ? String(object.candidateInit)
        : "",
      target: isSet(object.target) ? signalTargetFromJSON(object.target) : 0,
    };
  },

  toJSON(message: TrickleRequest): unknown {
    const obj: any = {};
    message.candidateInit !== undefined &&
      (obj.candidateInit = message.candidateInit);
    message.target !== undefined &&
      (obj.target = signalTargetToJSON(message.target));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<TrickleRequest>, I>>(
    object: I
  ): TrickleRequest {
    const message = createBaseTrickleRequest();
    message.candidateInit = object.candidateInit ?? "";
    message.target = object.target ?? 0;
    return message;
  },
};

function createBaseMuteTrackRequest(): MuteTrackRequest {
  return { sid: "", muted: false };
}

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
    const message = createBaseMuteTrackRequest();
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
    return {
      sid: isSet(object.sid) ? String(object.sid) : "",
      muted: isSet(object.muted) ? Boolean(object.muted) : false,
    };
  },

  toJSON(message: MuteTrackRequest): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.muted !== undefined && (obj.muted = message.muted);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MuteTrackRequest>, I>>(
    object: I
  ): MuteTrackRequest {
    const message = createBaseMuteTrackRequest();
    message.sid = object.sid ?? "";
    message.muted = object.muted ?? false;
    return message;
  },
};

function createBaseJoinResponse(): JoinResponse {
  return {
    room: undefined,
    participant: undefined,
    otherParticipants: [],
    serverVersion: "",
    iceServers: [],
    subscriberPrimary: false,
    alternativeUrl: "",
    clientConfiguration: undefined,
    serverRegion: "",
  };
}

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
    if (message.clientConfiguration !== undefined) {
      ClientConfiguration.encode(
        message.clientConfiguration,
        writer.uint32(66).fork()
      ).ldelim();
    }
    if (message.serverRegion !== "") {
      writer.uint32(74).string(message.serverRegion);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): JoinResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseJoinResponse();
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
        case 8:
          message.clientConfiguration = ClientConfiguration.decode(
            reader,
            reader.uint32()
          );
          break;
        case 9:
          message.serverRegion = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): JoinResponse {
    return {
      room: isSet(object.room) ? Room.fromJSON(object.room) : undefined,
      participant: isSet(object.participant)
        ? ParticipantInfo.fromJSON(object.participant)
        : undefined,
      otherParticipants: Array.isArray(object?.otherParticipants)
        ? object.otherParticipants.map((e: any) => ParticipantInfo.fromJSON(e))
        : [],
      serverVersion: isSet(object.serverVersion)
        ? String(object.serverVersion)
        : "",
      iceServers: Array.isArray(object?.iceServers)
        ? object.iceServers.map((e: any) => ICEServer.fromJSON(e))
        : [],
      subscriberPrimary: isSet(object.subscriberPrimary)
        ? Boolean(object.subscriberPrimary)
        : false,
      alternativeUrl: isSet(object.alternativeUrl)
        ? String(object.alternativeUrl)
        : "",
      clientConfiguration: isSet(object.clientConfiguration)
        ? ClientConfiguration.fromJSON(object.clientConfiguration)
        : undefined,
      serverRegion: isSet(object.serverRegion)
        ? String(object.serverRegion)
        : "",
    };
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
    message.clientConfiguration !== undefined &&
      (obj.clientConfiguration = message.clientConfiguration
        ? ClientConfiguration.toJSON(message.clientConfiguration)
        : undefined);
    message.serverRegion !== undefined &&
      (obj.serverRegion = message.serverRegion);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<JoinResponse>, I>>(
    object: I
  ): JoinResponse {
    const message = createBaseJoinResponse();
    message.room =
      object.room !== undefined && object.room !== null
        ? Room.fromPartial(object.room)
        : undefined;
    message.participant =
      object.participant !== undefined && object.participant !== null
        ? ParticipantInfo.fromPartial(object.participant)
        : undefined;
    message.otherParticipants =
      object.otherParticipants?.map((e) => ParticipantInfo.fromPartial(e)) ||
      [];
    message.serverVersion = object.serverVersion ?? "";
    message.iceServers =
      object.iceServers?.map((e) => ICEServer.fromPartial(e)) || [];
    message.subscriberPrimary = object.subscriberPrimary ?? false;
    message.alternativeUrl = object.alternativeUrl ?? "";
    message.clientConfiguration =
      object.clientConfiguration !== undefined &&
      object.clientConfiguration !== null
        ? ClientConfiguration.fromPartial(object.clientConfiguration)
        : undefined;
    message.serverRegion = object.serverRegion ?? "";
    return message;
  },
};

function createBaseTrackPublishedResponse(): TrackPublishedResponse {
  return { cid: "", track: undefined };
}

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
    const message = createBaseTrackPublishedResponse();
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
    return {
      cid: isSet(object.cid) ? String(object.cid) : "",
      track: isSet(object.track) ? TrackInfo.fromJSON(object.track) : undefined,
    };
  },

  toJSON(message: TrackPublishedResponse): unknown {
    const obj: any = {};
    message.cid !== undefined && (obj.cid = message.cid);
    message.track !== undefined &&
      (obj.track = message.track ? TrackInfo.toJSON(message.track) : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<TrackPublishedResponse>, I>>(
    object: I
  ): TrackPublishedResponse {
    const message = createBaseTrackPublishedResponse();
    message.cid = object.cid ?? "";
    message.track =
      object.track !== undefined && object.track !== null
        ? TrackInfo.fromPartial(object.track)
        : undefined;
    return message;
  },
};

function createBaseTrackUnpublishedResponse(): TrackUnpublishedResponse {
  return { trackSid: "" };
}

export const TrackUnpublishedResponse = {
  encode(
    message: TrackUnpublishedResponse,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.trackSid !== "") {
      writer.uint32(10).string(message.trackSid);
    }
    return writer;
  },

  decode(
    input: _m0.Reader | Uint8Array,
    length?: number
  ): TrackUnpublishedResponse {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseTrackUnpublishedResponse();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.trackSid = reader.string();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): TrackUnpublishedResponse {
    return {
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : "",
    };
  },

  toJSON(message: TrackUnpublishedResponse): unknown {
    const obj: any = {};
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<TrackUnpublishedResponse>, I>>(
    object: I
  ): TrackUnpublishedResponse {
    const message = createBaseTrackUnpublishedResponse();
    message.trackSid = object.trackSid ?? "";
    return message;
  },
};

function createBaseSessionDescription(): SessionDescription {
  return { type: "", sdp: "" };
}

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
    const message = createBaseSessionDescription();
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
    return {
      type: isSet(object.type) ? String(object.type) : "",
      sdp: isSet(object.sdp) ? String(object.sdp) : "",
    };
  },

  toJSON(message: SessionDescription): unknown {
    const obj: any = {};
    message.type !== undefined && (obj.type = message.type);
    message.sdp !== undefined && (obj.sdp = message.sdp);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SessionDescription>, I>>(
    object: I
  ): SessionDescription {
    const message = createBaseSessionDescription();
    message.type = object.type ?? "";
    message.sdp = object.sdp ?? "";
    return message;
  },
};

function createBaseParticipantUpdate(): ParticipantUpdate {
  return { participants: [] };
}

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
    const message = createBaseParticipantUpdate();
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
    return {
      participants: Array.isArray(object?.participants)
        ? object.participants.map((e: any) => ParticipantInfo.fromJSON(e))
        : [],
    };
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

  fromPartial<I extends Exact<DeepPartial<ParticipantUpdate>, I>>(
    object: I
  ): ParticipantUpdate {
    const message = createBaseParticipantUpdate();
    message.participants =
      object.participants?.map((e) => ParticipantInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseUpdateSubscription(): UpdateSubscription {
  return { trackSids: [], subscribe: false, participantTracks: [] };
}

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
    const message = createBaseUpdateSubscription();
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
    return {
      trackSids: Array.isArray(object?.trackSids)
        ? object.trackSids.map((e: any) => String(e))
        : [],
      subscribe: isSet(object.subscribe) ? Boolean(object.subscribe) : false,
      participantTracks: Array.isArray(object?.participantTracks)
        ? object.participantTracks.map((e: any) =>
            ParticipantTracks.fromJSON(e)
          )
        : [],
    };
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

  fromPartial<I extends Exact<DeepPartial<UpdateSubscription>, I>>(
    object: I
  ): UpdateSubscription {
    const message = createBaseUpdateSubscription();
    message.trackSids = object.trackSids?.map((e) => e) || [];
    message.subscribe = object.subscribe ?? false;
    message.participantTracks =
      object.participantTracks?.map((e) => ParticipantTracks.fromPartial(e)) ||
      [];
    return message;
  },
};

function createBaseUpdateTrackSettings(): UpdateTrackSettings {
  return { trackSids: [], disabled: false, quality: 0, width: 0, height: 0 };
}

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
    const message = createBaseUpdateTrackSettings();
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
    return {
      trackSids: Array.isArray(object?.trackSids)
        ? object.trackSids.map((e: any) => String(e))
        : [],
      disabled: isSet(object.disabled) ? Boolean(object.disabled) : false,
      quality: isSet(object.quality) ? videoQualityFromJSON(object.quality) : 0,
      width: isSet(object.width) ? Number(object.width) : 0,
      height: isSet(object.height) ? Number(object.height) : 0,
    };
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
    message.width !== undefined && (obj.width = Math.round(message.width));
    message.height !== undefined && (obj.height = Math.round(message.height));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<UpdateTrackSettings>, I>>(
    object: I
  ): UpdateTrackSettings {
    const message = createBaseUpdateTrackSettings();
    message.trackSids = object.trackSids?.map((e) => e) || [];
    message.disabled = object.disabled ?? false;
    message.quality = object.quality ?? 0;
    message.width = object.width ?? 0;
    message.height = object.height ?? 0;
    return message;
  },
};

function createBaseLeaveRequest(): LeaveRequest {
  return { canReconnect: false };
}

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
    const message = createBaseLeaveRequest();
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
    return {
      canReconnect: isSet(object.canReconnect)
        ? Boolean(object.canReconnect)
        : false,
    };
  },

  toJSON(message: LeaveRequest): unknown {
    const obj: any = {};
    message.canReconnect !== undefined &&
      (obj.canReconnect = message.canReconnect);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<LeaveRequest>, I>>(
    object: I
  ): LeaveRequest {
    const message = createBaseLeaveRequest();
    message.canReconnect = object.canReconnect ?? false;
    return message;
  },
};

function createBaseUpdateVideoLayers(): UpdateVideoLayers {
  return { trackSid: "", layers: [] };
}

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
    const message = createBaseUpdateVideoLayers();
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
    return {
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : "",
      layers: Array.isArray(object?.layers)
        ? object.layers.map((e: any) => VideoLayer.fromJSON(e))
        : [],
    };
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

  fromPartial<I extends Exact<DeepPartial<UpdateVideoLayers>, I>>(
    object: I
  ): UpdateVideoLayers {
    const message = createBaseUpdateVideoLayers();
    message.trackSid = object.trackSid ?? "";
    message.layers = object.layers?.map((e) => VideoLayer.fromPartial(e)) || [];
    return message;
  },
};

function createBaseICEServer(): ICEServer {
  return { urls: [], username: "", credential: "" };
}

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
    const message = createBaseICEServer();
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
    return {
      urls: Array.isArray(object?.urls)
        ? object.urls.map((e: any) => String(e))
        : [],
      username: isSet(object.username) ? String(object.username) : "",
      credential: isSet(object.credential) ? String(object.credential) : "",
    };
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

  fromPartial<I extends Exact<DeepPartial<ICEServer>, I>>(
    object: I
  ): ICEServer {
    const message = createBaseICEServer();
    message.urls = object.urls?.map((e) => e) || [];
    message.username = object.username ?? "";
    message.credential = object.credential ?? "";
    return message;
  },
};

function createBaseSpeakersChanged(): SpeakersChanged {
  return { speakers: [] };
}

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
    const message = createBaseSpeakersChanged();
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
    return {
      speakers: Array.isArray(object?.speakers)
        ? object.speakers.map((e: any) => SpeakerInfo.fromJSON(e))
        : [],
    };
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

  fromPartial<I extends Exact<DeepPartial<SpeakersChanged>, I>>(
    object: I
  ): SpeakersChanged {
    const message = createBaseSpeakersChanged();
    message.speakers =
      object.speakers?.map((e) => SpeakerInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseRoomUpdate(): RoomUpdate {
  return { room: undefined };
}

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
    const message = createBaseRoomUpdate();
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
    return {
      room: isSet(object.room) ? Room.fromJSON(object.room) : undefined,
    };
  },

  toJSON(message: RoomUpdate): unknown {
    const obj: any = {};
    message.room !== undefined &&
      (obj.room = message.room ? Room.toJSON(message.room) : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<RoomUpdate>, I>>(
    object: I
  ): RoomUpdate {
    const message = createBaseRoomUpdate();
    message.room =
      object.room !== undefined && object.room !== null
        ? Room.fromPartial(object.room)
        : undefined;
    return message;
  },
};

function createBaseConnectionQualityInfo(): ConnectionQualityInfo {
  return { participantSid: "", quality: 0, score: 0 };
}

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
    const message = createBaseConnectionQualityInfo();
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
    return {
      participantSid: isSet(object.participantSid)
        ? String(object.participantSid)
        : "",
      quality: isSet(object.quality)
        ? connectionQualityFromJSON(object.quality)
        : 0,
      score: isSet(object.score) ? Number(object.score) : 0,
    };
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

  fromPartial<I extends Exact<DeepPartial<ConnectionQualityInfo>, I>>(
    object: I
  ): ConnectionQualityInfo {
    const message = createBaseConnectionQualityInfo();
    message.participantSid = object.participantSid ?? "";
    message.quality = object.quality ?? 0;
    message.score = object.score ?? 0;
    return message;
  },
};

function createBaseConnectionQualityUpdate(): ConnectionQualityUpdate {
  return { updates: [] };
}

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
    const message = createBaseConnectionQualityUpdate();
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
    return {
      updates: Array.isArray(object?.updates)
        ? object.updates.map((e: any) => ConnectionQualityInfo.fromJSON(e))
        : [],
    };
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

  fromPartial<I extends Exact<DeepPartial<ConnectionQualityUpdate>, I>>(
    object: I
  ): ConnectionQualityUpdate {
    const message = createBaseConnectionQualityUpdate();
    message.updates =
      object.updates?.map((e) => ConnectionQualityInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseStreamStateInfo(): StreamStateInfo {
  return { participantSid: "", trackSid: "", state: 0 };
}

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
    const message = createBaseStreamStateInfo();
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
    return {
      participantSid: isSet(object.participantSid)
        ? String(object.participantSid)
        : "",
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : "",
      state: isSet(object.state) ? streamStateFromJSON(object.state) : 0,
    };
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

  fromPartial<I extends Exact<DeepPartial<StreamStateInfo>, I>>(
    object: I
  ): StreamStateInfo {
    const message = createBaseStreamStateInfo();
    message.participantSid = object.participantSid ?? "";
    message.trackSid = object.trackSid ?? "";
    message.state = object.state ?? 0;
    return message;
  },
};

function createBaseStreamStateUpdate(): StreamStateUpdate {
  return { streamStates: [] };
}

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
    const message = createBaseStreamStateUpdate();
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
    return {
      streamStates: Array.isArray(object?.streamStates)
        ? object.streamStates.map((e: any) => StreamStateInfo.fromJSON(e))
        : [],
    };
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

  fromPartial<I extends Exact<DeepPartial<StreamStateUpdate>, I>>(
    object: I
  ): StreamStateUpdate {
    const message = createBaseStreamStateUpdate();
    message.streamStates =
      object.streamStates?.map((e) => StreamStateInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseSubscribedQuality(): SubscribedQuality {
  return { quality: 0, enabled: false };
}

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
    const message = createBaseSubscribedQuality();
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
    return {
      quality: isSet(object.quality) ? videoQualityFromJSON(object.quality) : 0,
      enabled: isSet(object.enabled) ? Boolean(object.enabled) : false,
    };
  },

  toJSON(message: SubscribedQuality): unknown {
    const obj: any = {};
    message.quality !== undefined &&
      (obj.quality = videoQualityToJSON(message.quality));
    message.enabled !== undefined && (obj.enabled = message.enabled);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SubscribedQuality>, I>>(
    object: I
  ): SubscribedQuality {
    const message = createBaseSubscribedQuality();
    message.quality = object.quality ?? 0;
    message.enabled = object.enabled ?? false;
    return message;
  },
};

function createBaseSubscribedQualityUpdate(): SubscribedQualityUpdate {
  return { trackSid: "", subscribedQualities: [] };
}

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
    const message = createBaseSubscribedQualityUpdate();
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
    return {
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : "",
      subscribedQualities: Array.isArray(object?.subscribedQualities)
        ? object.subscribedQualities.map((e: any) =>
            SubscribedQuality.fromJSON(e)
          )
        : [],
    };
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

  fromPartial<I extends Exact<DeepPartial<SubscribedQualityUpdate>, I>>(
    object: I
  ): SubscribedQualityUpdate {
    const message = createBaseSubscribedQualityUpdate();
    message.trackSid = object.trackSid ?? "";
    message.subscribedQualities =
      object.subscribedQualities?.map((e) =>
        SubscribedQuality.fromPartial(e)
      ) || [];
    return message;
  },
};

function createBaseTrackPermission(): TrackPermission {
  return { participantSid: "", allTracks: false, trackSids: [] };
}

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
    const message = createBaseTrackPermission();
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
    return {
      participantSid: isSet(object.participantSid)
        ? String(object.participantSid)
        : "",
      allTracks: isSet(object.allTracks) ? Boolean(object.allTracks) : false,
      trackSids: Array.isArray(object?.trackSids)
        ? object.trackSids.map((e: any) => String(e))
        : [],
    };
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

  fromPartial<I extends Exact<DeepPartial<TrackPermission>, I>>(
    object: I
  ): TrackPermission {
    const message = createBaseTrackPermission();
    message.participantSid = object.participantSid ?? "";
    message.allTracks = object.allTracks ?? false;
    message.trackSids = object.trackSids?.map((e) => e) || [];
    return message;
  },
};

function createBaseSubscriptionPermission(): SubscriptionPermission {
  return { allParticipants: false, trackPermissions: [] };
}

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
    const message = createBaseSubscriptionPermission();
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
    return {
      allParticipants: isSet(object.allParticipants)
        ? Boolean(object.allParticipants)
        : false,
      trackPermissions: Array.isArray(object?.trackPermissions)
        ? object.trackPermissions.map((e: any) => TrackPermission.fromJSON(e))
        : [],
    };
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

  fromPartial<I extends Exact<DeepPartial<SubscriptionPermission>, I>>(
    object: I
  ): SubscriptionPermission {
    const message = createBaseSubscriptionPermission();
    message.allParticipants = object.allParticipants ?? false;
    message.trackPermissions =
      object.trackPermissions?.map((e) => TrackPermission.fromPartial(e)) || [];
    return message;
  },
};

function createBaseSubscriptionPermissionUpdate(): SubscriptionPermissionUpdate {
  return { participantSid: "", trackSid: "", allowed: false };
}

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
    const message = createBaseSubscriptionPermissionUpdate();
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
    return {
      participantSid: isSet(object.participantSid)
        ? String(object.participantSid)
        : "",
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : "",
      allowed: isSet(object.allowed) ? Boolean(object.allowed) : false,
    };
  },

  toJSON(message: SubscriptionPermissionUpdate): unknown {
    const obj: any = {};
    message.participantSid !== undefined &&
      (obj.participantSid = message.participantSid);
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    message.allowed !== undefined && (obj.allowed = message.allowed);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SubscriptionPermissionUpdate>, I>>(
    object: I
  ): SubscriptionPermissionUpdate {
    const message = createBaseSubscriptionPermissionUpdate();
    message.participantSid = object.participantSid ?? "";
    message.trackSid = object.trackSid ?? "";
    message.allowed = object.allowed ?? false;
    return message;
  },
};

function createBaseSyncState(): SyncState {
  return {
    answer: undefined,
    subscription: undefined,
    publishTracks: [],
    dataChannels: [],
  };
}

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
    for (const v of message.dataChannels) {
      DataChannelInfo.encode(v!, writer.uint32(34).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SyncState {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseSyncState();
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
        case 4:
          message.dataChannels.push(
            DataChannelInfo.decode(reader, reader.uint32())
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
    return {
      answer: isSet(object.answer)
        ? SessionDescription.fromJSON(object.answer)
        : undefined,
      subscription: isSet(object.subscription)
        ? UpdateSubscription.fromJSON(object.subscription)
        : undefined,
      publishTracks: Array.isArray(object?.publishTracks)
        ? object.publishTracks.map((e: any) =>
            TrackPublishedResponse.fromJSON(e)
          )
        : [],
      dataChannels: Array.isArray(object?.dataChannels)
        ? object.dataChannels.map((e: any) => DataChannelInfo.fromJSON(e))
        : [],
    };
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
    if (message.dataChannels) {
      obj.dataChannels = message.dataChannels.map((e) =>
        e ? DataChannelInfo.toJSON(e) : undefined
      );
    } else {
      obj.dataChannels = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SyncState>, I>>(
    object: I
  ): SyncState {
    const message = createBaseSyncState();
    message.answer =
      object.answer !== undefined && object.answer !== null
        ? SessionDescription.fromPartial(object.answer)
        : undefined;
    message.subscription =
      object.subscription !== undefined && object.subscription !== null
        ? UpdateSubscription.fromPartial(object.subscription)
        : undefined;
    message.publishTracks =
      object.publishTracks?.map((e) => TrackPublishedResponse.fromPartial(e)) ||
      [];
    message.dataChannels =
      object.dataChannels?.map((e) => DataChannelInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseDataChannelInfo(): DataChannelInfo {
  return { label: "", id: 0 };
}

export const DataChannelInfo = {
  encode(
    message: DataChannelInfo,
    writer: _m0.Writer = _m0.Writer.create()
  ): _m0.Writer {
    if (message.label !== "") {
      writer.uint32(10).string(message.label);
    }
    if (message.id !== 0) {
      writer.uint32(16).uint32(message.id);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): DataChannelInfo {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseDataChannelInfo();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.label = reader.string();
          break;
        case 2:
          message.id = reader.uint32();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): DataChannelInfo {
    return {
      label: isSet(object.label) ? String(object.label) : "",
      id: isSet(object.id) ? Number(object.id) : 0,
    };
  },

  toJSON(message: DataChannelInfo): unknown {
    const obj: any = {};
    message.label !== undefined && (obj.label = message.label);
    message.id !== undefined && (obj.id = Math.round(message.id));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<DataChannelInfo>, I>>(
    object: I
  ): DataChannelInfo {
    const message = createBaseDataChannelInfo();
    message.label = object.label ?? "";
    message.id = object.id ?? 0;
    return message;
  },
};

function createBaseSimulateScenario(): SimulateScenario {
  return {
    speakerUpdate: undefined,
    nodeFailure: undefined,
    migration: undefined,
    serverLeave: undefined,
  };
}

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
    const message = createBaseSimulateScenario();
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
    return {
      speakerUpdate: isSet(object.speakerUpdate)
        ? Number(object.speakerUpdate)
        : undefined,
      nodeFailure: isSet(object.nodeFailure)
        ? Boolean(object.nodeFailure)
        : undefined,
      migration: isSet(object.migration)
        ? Boolean(object.migration)
        : undefined,
      serverLeave: isSet(object.serverLeave)
        ? Boolean(object.serverLeave)
        : undefined,
    };
  },

  toJSON(message: SimulateScenario): unknown {
    const obj: any = {};
    message.speakerUpdate !== undefined &&
      (obj.speakerUpdate = Math.round(message.speakerUpdate));
    message.nodeFailure !== undefined &&
      (obj.nodeFailure = message.nodeFailure);
    message.migration !== undefined && (obj.migration = message.migration);
    message.serverLeave !== undefined &&
      (obj.serverLeave = message.serverLeave);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SimulateScenario>, I>>(
    object: I
  ): SimulateScenario {
    const message = createBaseSimulateScenario();
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

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin
  ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & Record<
        Exclude<keyof I, KeysOfUnion<P>>,
        never
      >;

if (_m0.util.Long !== Long) {
  _m0.util.Long = Long as any;
  _m0.configure();
}

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
