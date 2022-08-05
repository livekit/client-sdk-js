/* eslint-disable */
import {
  TrackType,
  TrackSource,
  Room,
  ParticipantInfo,
  ClientConfiguration,
  TrackInfo,
  VideoQuality,
  DisconnectReason,
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
  disconnectReasonFromJSON,
  disconnectReasonToJSON,
  connectionQualityFromJSON,
  connectionQualityToJSON,
} from './livekit_models';
import Long from 'long';
import _m0 from 'protobufjs/minimal';

export const protobufPackage = 'livekit';

export enum SignalTarget {
  PUBLISHER = 0,
  SUBSCRIBER = 1,
  UNRECOGNIZED = -1,
}

export function signalTargetFromJSON(object: any): SignalTarget {
  switch (object) {
    case 0:
    case 'PUBLISHER':
      return SignalTarget.PUBLISHER;
    case 1:
    case 'SUBSCRIBER':
      return SignalTarget.SUBSCRIBER;
    case -1:
    case 'UNRECOGNIZED':
    default:
      return SignalTarget.UNRECOGNIZED;
  }
}

export function signalTargetToJSON(object: SignalTarget): string {
  switch (object) {
    case SignalTarget.PUBLISHER:
      return 'PUBLISHER';
    case SignalTarget.SUBSCRIBER:
      return 'SUBSCRIBER';
    case SignalTarget.UNRECOGNIZED:
    default:
      return 'UNRECOGNIZED';
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
    case 'ACTIVE':
      return StreamState.ACTIVE;
    case 1:
    case 'PAUSED':
      return StreamState.PAUSED;
    case -1:
    case 'UNRECOGNIZED':
    default:
      return StreamState.UNRECOGNIZED;
  }
}

export function streamStateToJSON(object: StreamState): string {
  switch (object) {
    case StreamState.ACTIVE:
      return 'ACTIVE';
    case StreamState.PAUSED:
      return 'PAUSED';
    case StreamState.UNRECOGNIZED:
    default:
      return 'UNRECOGNIZED';
  }
}

export enum CandidateProtocol {
  UDP = 0,
  TCP = 1,
  UNRECOGNIZED = -1,
}

export function candidateProtocolFromJSON(object: any): CandidateProtocol {
  switch (object) {
    case 0:
    case 'UDP':
      return CandidateProtocol.UDP;
    case 1:
    case 'TCP':
      return CandidateProtocol.TCP;
    case -1:
    case 'UNRECOGNIZED':
    default:
      return CandidateProtocol.UNRECOGNIZED;
  }
}

export function candidateProtocolToJSON(object: CandidateProtocol): string {
  switch (object) {
    case CandidateProtocol.UDP:
      return 'UDP';
    case CandidateProtocol.TCP:
      return 'TCP';
    case CandidateProtocol.UNRECOGNIZED:
    default:
      return 'UNRECOGNIZED';
  }
}

export interface SignalRequest {
  message?:
    | { $case: 'offer'; offer: SessionDescription }
    | { $case: 'answer'; answer: SessionDescription }
    | { $case: 'trickle'; trickle: TrickleRequest }
    | { $case: 'addTrack'; addTrack: AddTrackRequest }
    | { $case: 'mute'; mute: MuteTrackRequest }
    | { $case: 'subscription'; subscription: UpdateSubscription }
    | { $case: 'trackSetting'; trackSetting: UpdateTrackSettings }
    | { $case: 'leave'; leave: LeaveRequest }
    | { $case: 'updateLayers'; updateLayers: UpdateVideoLayers }
    | { $case: 'subscriptionPermission'; subscriptionPermission: SubscriptionPermission }
    | { $case: 'syncState'; syncState: SyncState }
    | { $case: 'simulate'; simulate: SimulateScenario }
    | { $case: 'ping'; ping: number };
}

export interface SignalResponse {
  message?:
    | { $case: 'join'; join: JoinResponse }
    | { $case: 'answer'; answer: SessionDescription }
    | { $case: 'offer'; offer: SessionDescription }
    | { $case: 'trickle'; trickle: TrickleRequest }
    | { $case: 'update'; update: ParticipantUpdate }
    | { $case: 'trackPublished'; trackPublished: TrackPublishedResponse }
    | { $case: 'leave'; leave: LeaveRequest }
    | { $case: 'mute'; mute: MuteTrackRequest }
    | { $case: 'speakersChanged'; speakersChanged: SpeakersChanged }
    | { $case: 'roomUpdate'; roomUpdate: RoomUpdate }
    | { $case: 'connectionQuality'; connectionQuality: ConnectionQualityUpdate }
    | { $case: 'streamStateUpdate'; streamStateUpdate: StreamStateUpdate }
    | { $case: 'subscribedQualityUpdate'; subscribedQualityUpdate: SubscribedQualityUpdate }
    | {
        $case: 'subscriptionPermissionUpdate';
        subscriptionPermissionUpdate: SubscriptionPermissionUpdate;
      }
    | { $case: 'refreshToken'; refreshToken: string }
    | { $case: 'trackUnpublished'; trackUnpublished: TrackUnpublishedResponse }
    | { $case: 'pong'; pong: number };
}

export interface SimulcastCodec {
  codec: string;
  cid: string;
  enableSimulcastLayers: boolean;
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
  simulcastCodecs: SimulcastCodec[];
  /** server ID of track, publish new codec to exist track */
  sid: string;
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
  pingTimeout: number;
  pingInterval: number;
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
  reason: DisconnectReason;
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

export interface SubscribedCodec {
  codec: string;
  qualities: SubscribedQuality[];
}

export interface SubscribedQualityUpdate {
  trackSid: string;
  subscribedQualities: SubscribedQuality[];
  subscribedCodecs: SubscribedCodec[];
}

export interface TrackPermission {
  /** permission could be granted either by participant sid or identity */
  participantSid: string;
  allTracks: boolean;
  trackSids: string[];
  participantIdentity: string;
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
  target: SignalTarget;
}

export interface SimulateScenario {
  scenario?:
    | { $case: 'speakerUpdate'; speakerUpdate: number }
    | { $case: 'nodeFailure'; nodeFailure: boolean }
    | { $case: 'migration'; migration: boolean }
    | { $case: 'serverLeave'; serverLeave: boolean }
    | { $case: 'switchCandidateProtocol'; switchCandidateProtocol: CandidateProtocol };
}

function createBaseSignalRequest(): SignalRequest {
  return { message: undefined };
}

export const SignalRequest = {
  encode(message: SignalRequest, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.message?.$case === 'offer') {
      SessionDescription.encode(message.message.offer, writer.uint32(10).fork()).ldelim();
    }
    if (message.message?.$case === 'answer') {
      SessionDescription.encode(message.message.answer, writer.uint32(18).fork()).ldelim();
    }
    if (message.message?.$case === 'trickle') {
      TrickleRequest.encode(message.message.trickle, writer.uint32(26).fork()).ldelim();
    }
    if (message.message?.$case === 'addTrack') {
      AddTrackRequest.encode(message.message.addTrack, writer.uint32(34).fork()).ldelim();
    }
    if (message.message?.$case === 'mute') {
      MuteTrackRequest.encode(message.message.mute, writer.uint32(42).fork()).ldelim();
    }
    if (message.message?.$case === 'subscription') {
      UpdateSubscription.encode(message.message.subscription, writer.uint32(50).fork()).ldelim();
    }
    if (message.message?.$case === 'trackSetting') {
      UpdateTrackSettings.encode(message.message.trackSetting, writer.uint32(58).fork()).ldelim();
    }
    if (message.message?.$case === 'leave') {
      LeaveRequest.encode(message.message.leave, writer.uint32(66).fork()).ldelim();
    }
    if (message.message?.$case === 'updateLayers') {
      UpdateVideoLayers.encode(message.message.updateLayers, writer.uint32(82).fork()).ldelim();
    }
    if (message.message?.$case === 'subscriptionPermission') {
      SubscriptionPermission.encode(
        message.message.subscriptionPermission,
        writer.uint32(90).fork(),
      ).ldelim();
    }
    if (message.message?.$case === 'syncState') {
      SyncState.encode(message.message.syncState, writer.uint32(98).fork()).ldelim();
    }
    if (message.message?.$case === 'simulate') {
      SimulateScenario.encode(message.message.simulate, writer.uint32(106).fork()).ldelim();
    }
    if (message.message?.$case === 'ping') {
      writer.uint32(112).int64(message.message.ping);
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
          message.message = {
            $case: 'offer',
            offer: SessionDescription.decode(reader, reader.uint32()),
          };
          break;
        case 2:
          message.message = {
            $case: 'answer',
            answer: SessionDescription.decode(reader, reader.uint32()),
          };
          break;
        case 3:
          message.message = {
            $case: 'trickle',
            trickle: TrickleRequest.decode(reader, reader.uint32()),
          };
          break;
        case 4:
          message.message = {
            $case: 'addTrack',
            addTrack: AddTrackRequest.decode(reader, reader.uint32()),
          };
          break;
        case 5:
          message.message = {
            $case: 'mute',
            mute: MuteTrackRequest.decode(reader, reader.uint32()),
          };
          break;
        case 6:
          message.message = {
            $case: 'subscription',
            subscription: UpdateSubscription.decode(reader, reader.uint32()),
          };
          break;
        case 7:
          message.message = {
            $case: 'trackSetting',
            trackSetting: UpdateTrackSettings.decode(reader, reader.uint32()),
          };
          break;
        case 8:
          message.message = { $case: 'leave', leave: LeaveRequest.decode(reader, reader.uint32()) };
          break;
        case 10:
          message.message = {
            $case: 'updateLayers',
            updateLayers: UpdateVideoLayers.decode(reader, reader.uint32()),
          };
          break;
        case 11:
          message.message = {
            $case: 'subscriptionPermission',
            subscriptionPermission: SubscriptionPermission.decode(reader, reader.uint32()),
          };
          break;
        case 12:
          message.message = {
            $case: 'syncState',
            syncState: SyncState.decode(reader, reader.uint32()),
          };
          break;
        case 13:
          message.message = {
            $case: 'simulate',
            simulate: SimulateScenario.decode(reader, reader.uint32()),
          };
          break;
        case 14:
          message.message = { $case: 'ping', ping: longToNumber(reader.int64() as Long) };
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
      message: isSet(object.offer)
        ? { $case: 'offer', offer: SessionDescription.fromJSON(object.offer) }
        : isSet(object.answer)
        ? { $case: 'answer', answer: SessionDescription.fromJSON(object.answer) }
        : isSet(object.trickle)
        ? { $case: 'trickle', trickle: TrickleRequest.fromJSON(object.trickle) }
        : isSet(object.addTrack)
        ? { $case: 'addTrack', addTrack: AddTrackRequest.fromJSON(object.addTrack) }
        : isSet(object.mute)
        ? { $case: 'mute', mute: MuteTrackRequest.fromJSON(object.mute) }
        : isSet(object.subscription)
        ? { $case: 'subscription', subscription: UpdateSubscription.fromJSON(object.subscription) }
        : isSet(object.trackSetting)
        ? { $case: 'trackSetting', trackSetting: UpdateTrackSettings.fromJSON(object.trackSetting) }
        : isSet(object.leave)
        ? { $case: 'leave', leave: LeaveRequest.fromJSON(object.leave) }
        : isSet(object.updateLayers)
        ? { $case: 'updateLayers', updateLayers: UpdateVideoLayers.fromJSON(object.updateLayers) }
        : isSet(object.subscriptionPermission)
        ? {
            $case: 'subscriptionPermission',
            subscriptionPermission: SubscriptionPermission.fromJSON(object.subscriptionPermission),
          }
        : isSet(object.syncState)
        ? { $case: 'syncState', syncState: SyncState.fromJSON(object.syncState) }
        : isSet(object.simulate)
        ? { $case: 'simulate', simulate: SimulateScenario.fromJSON(object.simulate) }
        : isSet(object.ping)
        ? { $case: 'ping', ping: Number(object.ping) }
        : undefined,
    };
  },

  toJSON(message: SignalRequest): unknown {
    const obj: any = {};
    message.message?.$case === 'offer' &&
      (obj.offer = message.message?.offer
        ? SessionDescription.toJSON(message.message?.offer)
        : undefined);
    message.message?.$case === 'answer' &&
      (obj.answer = message.message?.answer
        ? SessionDescription.toJSON(message.message?.answer)
        : undefined);
    message.message?.$case === 'trickle' &&
      (obj.trickle = message.message?.trickle
        ? TrickleRequest.toJSON(message.message?.trickle)
        : undefined);
    message.message?.$case === 'addTrack' &&
      (obj.addTrack = message.message?.addTrack
        ? AddTrackRequest.toJSON(message.message?.addTrack)
        : undefined);
    message.message?.$case === 'mute' &&
      (obj.mute = message.message?.mute
        ? MuteTrackRequest.toJSON(message.message?.mute)
        : undefined);
    message.message?.$case === 'subscription' &&
      (obj.subscription = message.message?.subscription
        ? UpdateSubscription.toJSON(message.message?.subscription)
        : undefined);
    message.message?.$case === 'trackSetting' &&
      (obj.trackSetting = message.message?.trackSetting
        ? UpdateTrackSettings.toJSON(message.message?.trackSetting)
        : undefined);
    message.message?.$case === 'leave' &&
      (obj.leave = message.message?.leave
        ? LeaveRequest.toJSON(message.message?.leave)
        : undefined);
    message.message?.$case === 'updateLayers' &&
      (obj.updateLayers = message.message?.updateLayers
        ? UpdateVideoLayers.toJSON(message.message?.updateLayers)
        : undefined);
    message.message?.$case === 'subscriptionPermission' &&
      (obj.subscriptionPermission = message.message?.subscriptionPermission
        ? SubscriptionPermission.toJSON(message.message?.subscriptionPermission)
        : undefined);
    message.message?.$case === 'syncState' &&
      (obj.syncState = message.message?.syncState
        ? SyncState.toJSON(message.message?.syncState)
        : undefined);
    message.message?.$case === 'simulate' &&
      (obj.simulate = message.message?.simulate
        ? SimulateScenario.toJSON(message.message?.simulate)
        : undefined);
    message.message?.$case === 'ping' && (obj.ping = Math.round(message.message?.ping));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SignalRequest>, I>>(object: I): SignalRequest {
    const message = createBaseSignalRequest();
    if (
      object.message?.$case === 'offer' &&
      object.message?.offer !== undefined &&
      object.message?.offer !== null
    ) {
      message.message = {
        $case: 'offer',
        offer: SessionDescription.fromPartial(object.message.offer),
      };
    }
    if (
      object.message?.$case === 'answer' &&
      object.message?.answer !== undefined &&
      object.message?.answer !== null
    ) {
      message.message = {
        $case: 'answer',
        answer: SessionDescription.fromPartial(object.message.answer),
      };
    }
    if (
      object.message?.$case === 'trickle' &&
      object.message?.trickle !== undefined &&
      object.message?.trickle !== null
    ) {
      message.message = {
        $case: 'trickle',
        trickle: TrickleRequest.fromPartial(object.message.trickle),
      };
    }
    if (
      object.message?.$case === 'addTrack' &&
      object.message?.addTrack !== undefined &&
      object.message?.addTrack !== null
    ) {
      message.message = {
        $case: 'addTrack',
        addTrack: AddTrackRequest.fromPartial(object.message.addTrack),
      };
    }
    if (
      object.message?.$case === 'mute' &&
      object.message?.mute !== undefined &&
      object.message?.mute !== null
    ) {
      message.message = { $case: 'mute', mute: MuteTrackRequest.fromPartial(object.message.mute) };
    }
    if (
      object.message?.$case === 'subscription' &&
      object.message?.subscription !== undefined &&
      object.message?.subscription !== null
    ) {
      message.message = {
        $case: 'subscription',
        subscription: UpdateSubscription.fromPartial(object.message.subscription),
      };
    }
    if (
      object.message?.$case === 'trackSetting' &&
      object.message?.trackSetting !== undefined &&
      object.message?.trackSetting !== null
    ) {
      message.message = {
        $case: 'trackSetting',
        trackSetting: UpdateTrackSettings.fromPartial(object.message.trackSetting),
      };
    }
    if (
      object.message?.$case === 'leave' &&
      object.message?.leave !== undefined &&
      object.message?.leave !== null
    ) {
      message.message = { $case: 'leave', leave: LeaveRequest.fromPartial(object.message.leave) };
    }
    if (
      object.message?.$case === 'updateLayers' &&
      object.message?.updateLayers !== undefined &&
      object.message?.updateLayers !== null
    ) {
      message.message = {
        $case: 'updateLayers',
        updateLayers: UpdateVideoLayers.fromPartial(object.message.updateLayers),
      };
    }
    if (
      object.message?.$case === 'subscriptionPermission' &&
      object.message?.subscriptionPermission !== undefined &&
      object.message?.subscriptionPermission !== null
    ) {
      message.message = {
        $case: 'subscriptionPermission',
        subscriptionPermission: SubscriptionPermission.fromPartial(
          object.message.subscriptionPermission,
        ),
      };
    }
    if (
      object.message?.$case === 'syncState' &&
      object.message?.syncState !== undefined &&
      object.message?.syncState !== null
    ) {
      message.message = {
        $case: 'syncState',
        syncState: SyncState.fromPartial(object.message.syncState),
      };
    }
    if (
      object.message?.$case === 'simulate' &&
      object.message?.simulate !== undefined &&
      object.message?.simulate !== null
    ) {
      message.message = {
        $case: 'simulate',
        simulate: SimulateScenario.fromPartial(object.message.simulate),
      };
    }
    if (
      object.message?.$case === 'ping' &&
      object.message?.ping !== undefined &&
      object.message?.ping !== null
    ) {
      message.message = { $case: 'ping', ping: object.message.ping };
    }
    return message;
  },
};

function createBaseSignalResponse(): SignalResponse {
  return { message: undefined };
}

export const SignalResponse = {
  encode(message: SignalResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.message?.$case === 'join') {
      JoinResponse.encode(message.message.join, writer.uint32(10).fork()).ldelim();
    }
    if (message.message?.$case === 'answer') {
      SessionDescription.encode(message.message.answer, writer.uint32(18).fork()).ldelim();
    }
    if (message.message?.$case === 'offer') {
      SessionDescription.encode(message.message.offer, writer.uint32(26).fork()).ldelim();
    }
    if (message.message?.$case === 'trickle') {
      TrickleRequest.encode(message.message.trickle, writer.uint32(34).fork()).ldelim();
    }
    if (message.message?.$case === 'update') {
      ParticipantUpdate.encode(message.message.update, writer.uint32(42).fork()).ldelim();
    }
    if (message.message?.$case === 'trackPublished') {
      TrackPublishedResponse.encode(
        message.message.trackPublished,
        writer.uint32(50).fork(),
      ).ldelim();
    }
    if (message.message?.$case === 'leave') {
      LeaveRequest.encode(message.message.leave, writer.uint32(66).fork()).ldelim();
    }
    if (message.message?.$case === 'mute') {
      MuteTrackRequest.encode(message.message.mute, writer.uint32(74).fork()).ldelim();
    }
    if (message.message?.$case === 'speakersChanged') {
      SpeakersChanged.encode(message.message.speakersChanged, writer.uint32(82).fork()).ldelim();
    }
    if (message.message?.$case === 'roomUpdate') {
      RoomUpdate.encode(message.message.roomUpdate, writer.uint32(90).fork()).ldelim();
    }
    if (message.message?.$case === 'connectionQuality') {
      ConnectionQualityUpdate.encode(
        message.message.connectionQuality,
        writer.uint32(98).fork(),
      ).ldelim();
    }
    if (message.message?.$case === 'streamStateUpdate') {
      StreamStateUpdate.encode(
        message.message.streamStateUpdate,
        writer.uint32(106).fork(),
      ).ldelim();
    }
    if (message.message?.$case === 'subscribedQualityUpdate') {
      SubscribedQualityUpdate.encode(
        message.message.subscribedQualityUpdate,
        writer.uint32(114).fork(),
      ).ldelim();
    }
    if (message.message?.$case === 'subscriptionPermissionUpdate') {
      SubscriptionPermissionUpdate.encode(
        message.message.subscriptionPermissionUpdate,
        writer.uint32(122).fork(),
      ).ldelim();
    }
    if (message.message?.$case === 'refreshToken') {
      writer.uint32(130).string(message.message.refreshToken);
    }
    if (message.message?.$case === 'trackUnpublished') {
      TrackUnpublishedResponse.encode(
        message.message.trackUnpublished,
        writer.uint32(138).fork(),
      ).ldelim();
    }
    if (message.message?.$case === 'pong') {
      writer.uint32(144).int64(message.message.pong);
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
          message.message = { $case: 'join', join: JoinResponse.decode(reader, reader.uint32()) };
          break;
        case 2:
          message.message = {
            $case: 'answer',
            answer: SessionDescription.decode(reader, reader.uint32()),
          };
          break;
        case 3:
          message.message = {
            $case: 'offer',
            offer: SessionDescription.decode(reader, reader.uint32()),
          };
          break;
        case 4:
          message.message = {
            $case: 'trickle',
            trickle: TrickleRequest.decode(reader, reader.uint32()),
          };
          break;
        case 5:
          message.message = {
            $case: 'update',
            update: ParticipantUpdate.decode(reader, reader.uint32()),
          };
          break;
        case 6:
          message.message = {
            $case: 'trackPublished',
            trackPublished: TrackPublishedResponse.decode(reader, reader.uint32()),
          };
          break;
        case 8:
          message.message = { $case: 'leave', leave: LeaveRequest.decode(reader, reader.uint32()) };
          break;
        case 9:
          message.message = {
            $case: 'mute',
            mute: MuteTrackRequest.decode(reader, reader.uint32()),
          };
          break;
        case 10:
          message.message = {
            $case: 'speakersChanged',
            speakersChanged: SpeakersChanged.decode(reader, reader.uint32()),
          };
          break;
        case 11:
          message.message = {
            $case: 'roomUpdate',
            roomUpdate: RoomUpdate.decode(reader, reader.uint32()),
          };
          break;
        case 12:
          message.message = {
            $case: 'connectionQuality',
            connectionQuality: ConnectionQualityUpdate.decode(reader, reader.uint32()),
          };
          break;
        case 13:
          message.message = {
            $case: 'streamStateUpdate',
            streamStateUpdate: StreamStateUpdate.decode(reader, reader.uint32()),
          };
          break;
        case 14:
          message.message = {
            $case: 'subscribedQualityUpdate',
            subscribedQualityUpdate: SubscribedQualityUpdate.decode(reader, reader.uint32()),
          };
          break;
        case 15:
          message.message = {
            $case: 'subscriptionPermissionUpdate',
            subscriptionPermissionUpdate: SubscriptionPermissionUpdate.decode(
              reader,
              reader.uint32(),
            ),
          };
          break;
        case 16:
          message.message = { $case: 'refreshToken', refreshToken: reader.string() };
          break;
        case 17:
          message.message = {
            $case: 'trackUnpublished',
            trackUnpublished: TrackUnpublishedResponse.decode(reader, reader.uint32()),
          };
          break;
        case 18:
          message.message = { $case: 'pong', pong: longToNumber(reader.int64() as Long) };
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
      message: isSet(object.join)
        ? { $case: 'join', join: JoinResponse.fromJSON(object.join) }
        : isSet(object.answer)
        ? { $case: 'answer', answer: SessionDescription.fromJSON(object.answer) }
        : isSet(object.offer)
        ? { $case: 'offer', offer: SessionDescription.fromJSON(object.offer) }
        : isSet(object.trickle)
        ? { $case: 'trickle', trickle: TrickleRequest.fromJSON(object.trickle) }
        : isSet(object.update)
        ? { $case: 'update', update: ParticipantUpdate.fromJSON(object.update) }
        : isSet(object.trackPublished)
        ? {
            $case: 'trackPublished',
            trackPublished: TrackPublishedResponse.fromJSON(object.trackPublished),
          }
        : isSet(object.leave)
        ? { $case: 'leave', leave: LeaveRequest.fromJSON(object.leave) }
        : isSet(object.mute)
        ? { $case: 'mute', mute: MuteTrackRequest.fromJSON(object.mute) }
        : isSet(object.speakersChanged)
        ? {
            $case: 'speakersChanged',
            speakersChanged: SpeakersChanged.fromJSON(object.speakersChanged),
          }
        : isSet(object.roomUpdate)
        ? { $case: 'roomUpdate', roomUpdate: RoomUpdate.fromJSON(object.roomUpdate) }
        : isSet(object.connectionQuality)
        ? {
            $case: 'connectionQuality',
            connectionQuality: ConnectionQualityUpdate.fromJSON(object.connectionQuality),
          }
        : isSet(object.streamStateUpdate)
        ? {
            $case: 'streamStateUpdate',
            streamStateUpdate: StreamStateUpdate.fromJSON(object.streamStateUpdate),
          }
        : isSet(object.subscribedQualityUpdate)
        ? {
            $case: 'subscribedQualityUpdate',
            subscribedQualityUpdate: SubscribedQualityUpdate.fromJSON(
              object.subscribedQualityUpdate,
            ),
          }
        : isSet(object.subscriptionPermissionUpdate)
        ? {
            $case: 'subscriptionPermissionUpdate',
            subscriptionPermissionUpdate: SubscriptionPermissionUpdate.fromJSON(
              object.subscriptionPermissionUpdate,
            ),
          }
        : isSet(object.refreshToken)
        ? { $case: 'refreshToken', refreshToken: String(object.refreshToken) }
        : isSet(object.trackUnpublished)
        ? {
            $case: 'trackUnpublished',
            trackUnpublished: TrackUnpublishedResponse.fromJSON(object.trackUnpublished),
          }
        : isSet(object.pong)
        ? { $case: 'pong', pong: Number(object.pong) }
        : undefined,
    };
  },

  toJSON(message: SignalResponse): unknown {
    const obj: any = {};
    message.message?.$case === 'join' &&
      (obj.join = message.message?.join ? JoinResponse.toJSON(message.message?.join) : undefined);
    message.message?.$case === 'answer' &&
      (obj.answer = message.message?.answer
        ? SessionDescription.toJSON(message.message?.answer)
        : undefined);
    message.message?.$case === 'offer' &&
      (obj.offer = message.message?.offer
        ? SessionDescription.toJSON(message.message?.offer)
        : undefined);
    message.message?.$case === 'trickle' &&
      (obj.trickle = message.message?.trickle
        ? TrickleRequest.toJSON(message.message?.trickle)
        : undefined);
    message.message?.$case === 'update' &&
      (obj.update = message.message?.update
        ? ParticipantUpdate.toJSON(message.message?.update)
        : undefined);
    message.message?.$case === 'trackPublished' &&
      (obj.trackPublished = message.message?.trackPublished
        ? TrackPublishedResponse.toJSON(message.message?.trackPublished)
        : undefined);
    message.message?.$case === 'leave' &&
      (obj.leave = message.message?.leave
        ? LeaveRequest.toJSON(message.message?.leave)
        : undefined);
    message.message?.$case === 'mute' &&
      (obj.mute = message.message?.mute
        ? MuteTrackRequest.toJSON(message.message?.mute)
        : undefined);
    message.message?.$case === 'speakersChanged' &&
      (obj.speakersChanged = message.message?.speakersChanged
        ? SpeakersChanged.toJSON(message.message?.speakersChanged)
        : undefined);
    message.message?.$case === 'roomUpdate' &&
      (obj.roomUpdate = message.message?.roomUpdate
        ? RoomUpdate.toJSON(message.message?.roomUpdate)
        : undefined);
    message.message?.$case === 'connectionQuality' &&
      (obj.connectionQuality = message.message?.connectionQuality
        ? ConnectionQualityUpdate.toJSON(message.message?.connectionQuality)
        : undefined);
    message.message?.$case === 'streamStateUpdate' &&
      (obj.streamStateUpdate = message.message?.streamStateUpdate
        ? StreamStateUpdate.toJSON(message.message?.streamStateUpdate)
        : undefined);
    message.message?.$case === 'subscribedQualityUpdate' &&
      (obj.subscribedQualityUpdate = message.message?.subscribedQualityUpdate
        ? SubscribedQualityUpdate.toJSON(message.message?.subscribedQualityUpdate)
        : undefined);
    message.message?.$case === 'subscriptionPermissionUpdate' &&
      (obj.subscriptionPermissionUpdate = message.message?.subscriptionPermissionUpdate
        ? SubscriptionPermissionUpdate.toJSON(message.message?.subscriptionPermissionUpdate)
        : undefined);
    message.message?.$case === 'refreshToken' && (obj.refreshToken = message.message?.refreshToken);
    message.message?.$case === 'trackUnpublished' &&
      (obj.trackUnpublished = message.message?.trackUnpublished
        ? TrackUnpublishedResponse.toJSON(message.message?.trackUnpublished)
        : undefined);
    message.message?.$case === 'pong' && (obj.pong = Math.round(message.message?.pong));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SignalResponse>, I>>(object: I): SignalResponse {
    const message = createBaseSignalResponse();
    if (
      object.message?.$case === 'join' &&
      object.message?.join !== undefined &&
      object.message?.join !== null
    ) {
      message.message = { $case: 'join', join: JoinResponse.fromPartial(object.message.join) };
    }
    if (
      object.message?.$case === 'answer' &&
      object.message?.answer !== undefined &&
      object.message?.answer !== null
    ) {
      message.message = {
        $case: 'answer',
        answer: SessionDescription.fromPartial(object.message.answer),
      };
    }
    if (
      object.message?.$case === 'offer' &&
      object.message?.offer !== undefined &&
      object.message?.offer !== null
    ) {
      message.message = {
        $case: 'offer',
        offer: SessionDescription.fromPartial(object.message.offer),
      };
    }
    if (
      object.message?.$case === 'trickle' &&
      object.message?.trickle !== undefined &&
      object.message?.trickle !== null
    ) {
      message.message = {
        $case: 'trickle',
        trickle: TrickleRequest.fromPartial(object.message.trickle),
      };
    }
    if (
      object.message?.$case === 'update' &&
      object.message?.update !== undefined &&
      object.message?.update !== null
    ) {
      message.message = {
        $case: 'update',
        update: ParticipantUpdate.fromPartial(object.message.update),
      };
    }
    if (
      object.message?.$case === 'trackPublished' &&
      object.message?.trackPublished !== undefined &&
      object.message?.trackPublished !== null
    ) {
      message.message = {
        $case: 'trackPublished',
        trackPublished: TrackPublishedResponse.fromPartial(object.message.trackPublished),
      };
    }
    if (
      object.message?.$case === 'leave' &&
      object.message?.leave !== undefined &&
      object.message?.leave !== null
    ) {
      message.message = { $case: 'leave', leave: LeaveRequest.fromPartial(object.message.leave) };
    }
    if (
      object.message?.$case === 'mute' &&
      object.message?.mute !== undefined &&
      object.message?.mute !== null
    ) {
      message.message = { $case: 'mute', mute: MuteTrackRequest.fromPartial(object.message.mute) };
    }
    if (
      object.message?.$case === 'speakersChanged' &&
      object.message?.speakersChanged !== undefined &&
      object.message?.speakersChanged !== null
    ) {
      message.message = {
        $case: 'speakersChanged',
        speakersChanged: SpeakersChanged.fromPartial(object.message.speakersChanged),
      };
    }
    if (
      object.message?.$case === 'roomUpdate' &&
      object.message?.roomUpdate !== undefined &&
      object.message?.roomUpdate !== null
    ) {
      message.message = {
        $case: 'roomUpdate',
        roomUpdate: RoomUpdate.fromPartial(object.message.roomUpdate),
      };
    }
    if (
      object.message?.$case === 'connectionQuality' &&
      object.message?.connectionQuality !== undefined &&
      object.message?.connectionQuality !== null
    ) {
      message.message = {
        $case: 'connectionQuality',
        connectionQuality: ConnectionQualityUpdate.fromPartial(object.message.connectionQuality),
      };
    }
    if (
      object.message?.$case === 'streamStateUpdate' &&
      object.message?.streamStateUpdate !== undefined &&
      object.message?.streamStateUpdate !== null
    ) {
      message.message = {
        $case: 'streamStateUpdate',
        streamStateUpdate: StreamStateUpdate.fromPartial(object.message.streamStateUpdate),
      };
    }
    if (
      object.message?.$case === 'subscribedQualityUpdate' &&
      object.message?.subscribedQualityUpdate !== undefined &&
      object.message?.subscribedQualityUpdate !== null
    ) {
      message.message = {
        $case: 'subscribedQualityUpdate',
        subscribedQualityUpdate: SubscribedQualityUpdate.fromPartial(
          object.message.subscribedQualityUpdate,
        ),
      };
    }
    if (
      object.message?.$case === 'subscriptionPermissionUpdate' &&
      object.message?.subscriptionPermissionUpdate !== undefined &&
      object.message?.subscriptionPermissionUpdate !== null
    ) {
      message.message = {
        $case: 'subscriptionPermissionUpdate',
        subscriptionPermissionUpdate: SubscriptionPermissionUpdate.fromPartial(
          object.message.subscriptionPermissionUpdate,
        ),
      };
    }
    if (
      object.message?.$case === 'refreshToken' &&
      object.message?.refreshToken !== undefined &&
      object.message?.refreshToken !== null
    ) {
      message.message = { $case: 'refreshToken', refreshToken: object.message.refreshToken };
    }
    if (
      object.message?.$case === 'trackUnpublished' &&
      object.message?.trackUnpublished !== undefined &&
      object.message?.trackUnpublished !== null
    ) {
      message.message = {
        $case: 'trackUnpublished',
        trackUnpublished: TrackUnpublishedResponse.fromPartial(object.message.trackUnpublished),
      };
    }
    if (
      object.message?.$case === 'pong' &&
      object.message?.pong !== undefined &&
      object.message?.pong !== null
    ) {
      message.message = { $case: 'pong', pong: object.message.pong };
    }
    return message;
  },
};

function createBaseSimulcastCodec(): SimulcastCodec {
  return { codec: '', cid: '', enableSimulcastLayers: false };
}

export const SimulcastCodec = {
  encode(message: SimulcastCodec, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.codec !== '') {
      writer.uint32(10).string(message.codec);
    }
    if (message.cid !== '') {
      writer.uint32(18).string(message.cid);
    }
    if (message.enableSimulcastLayers === true) {
      writer.uint32(24).bool(message.enableSimulcastLayers);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SimulcastCodec {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseSimulcastCodec();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.codec = reader.string();
          break;
        case 2:
          message.cid = reader.string();
          break;
        case 3:
          message.enableSimulcastLayers = reader.bool();
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SimulcastCodec {
    return {
      codec: isSet(object.codec) ? String(object.codec) : '',
      cid: isSet(object.cid) ? String(object.cid) : '',
      enableSimulcastLayers: isSet(object.enableSimulcastLayers)
        ? Boolean(object.enableSimulcastLayers)
        : false,
    };
  },

  toJSON(message: SimulcastCodec): unknown {
    const obj: any = {};
    message.codec !== undefined && (obj.codec = message.codec);
    message.cid !== undefined && (obj.cid = message.cid);
    message.enableSimulcastLayers !== undefined &&
      (obj.enableSimulcastLayers = message.enableSimulcastLayers);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SimulcastCodec>, I>>(object: I): SimulcastCodec {
    const message = createBaseSimulcastCodec();
    message.codec = object.codec ?? '';
    message.cid = object.cid ?? '';
    message.enableSimulcastLayers = object.enableSimulcastLayers ?? false;
    return message;
  },
};

function createBaseAddTrackRequest(): AddTrackRequest {
  return {
    cid: '',
    name: '',
    type: 0,
    width: 0,
    height: 0,
    muted: false,
    disableDtx: false,
    source: 0,
    layers: [],
    simulcastCodecs: [],
    sid: '',
  };
}

export const AddTrackRequest = {
  encode(message: AddTrackRequest, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.cid !== '') {
      writer.uint32(10).string(message.cid);
    }
    if (message.name !== '') {
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
    for (const v of message.simulcastCodecs) {
      SimulcastCodec.encode(v!, writer.uint32(82).fork()).ldelim();
    }
    if (message.sid !== '') {
      writer.uint32(90).string(message.sid);
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
        case 10:
          message.simulcastCodecs.push(SimulcastCodec.decode(reader, reader.uint32()));
          break;
        case 11:
          message.sid = reader.string();
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
      cid: isSet(object.cid) ? String(object.cid) : '',
      name: isSet(object.name) ? String(object.name) : '',
      type: isSet(object.type) ? trackTypeFromJSON(object.type) : 0,
      width: isSet(object.width) ? Number(object.width) : 0,
      height: isSet(object.height) ? Number(object.height) : 0,
      muted: isSet(object.muted) ? Boolean(object.muted) : false,
      disableDtx: isSet(object.disableDtx) ? Boolean(object.disableDtx) : false,
      source: isSet(object.source) ? trackSourceFromJSON(object.source) : 0,
      layers: Array.isArray(object?.layers)
        ? object.layers.map((e: any) => VideoLayer.fromJSON(e))
        : [],
      simulcastCodecs: Array.isArray(object?.simulcastCodecs)
        ? object.simulcastCodecs.map((e: any) => SimulcastCodec.fromJSON(e))
        : [],
      sid: isSet(object.sid) ? String(object.sid) : '',
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
    message.source !== undefined && (obj.source = trackSourceToJSON(message.source));
    if (message.layers) {
      obj.layers = message.layers.map((e) => (e ? VideoLayer.toJSON(e) : undefined));
    } else {
      obj.layers = [];
    }
    if (message.simulcastCodecs) {
      obj.simulcastCodecs = message.simulcastCodecs.map((e) =>
        e ? SimulcastCodec.toJSON(e) : undefined,
      );
    } else {
      obj.simulcastCodecs = [];
    }
    message.sid !== undefined && (obj.sid = message.sid);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<AddTrackRequest>, I>>(object: I): AddTrackRequest {
    const message = createBaseAddTrackRequest();
    message.cid = object.cid ?? '';
    message.name = object.name ?? '';
    message.type = object.type ?? 0;
    message.width = object.width ?? 0;
    message.height = object.height ?? 0;
    message.muted = object.muted ?? false;
    message.disableDtx = object.disableDtx ?? false;
    message.source = object.source ?? 0;
    message.layers = object.layers?.map((e) => VideoLayer.fromPartial(e)) || [];
    message.simulcastCodecs =
      object.simulcastCodecs?.map((e) => SimulcastCodec.fromPartial(e)) || [];
    message.sid = object.sid ?? '';
    return message;
  },
};

function createBaseTrickleRequest(): TrickleRequest {
  return { candidateInit: '', target: 0 };
}

export const TrickleRequest = {
  encode(message: TrickleRequest, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.candidateInit !== '') {
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
      candidateInit: isSet(object.candidateInit) ? String(object.candidateInit) : '',
      target: isSet(object.target) ? signalTargetFromJSON(object.target) : 0,
    };
  },

  toJSON(message: TrickleRequest): unknown {
    const obj: any = {};
    message.candidateInit !== undefined && (obj.candidateInit = message.candidateInit);
    message.target !== undefined && (obj.target = signalTargetToJSON(message.target));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<TrickleRequest>, I>>(object: I): TrickleRequest {
    const message = createBaseTrickleRequest();
    message.candidateInit = object.candidateInit ?? '';
    message.target = object.target ?? 0;
    return message;
  },
};

function createBaseMuteTrackRequest(): MuteTrackRequest {
  return { sid: '', muted: false };
}

export const MuteTrackRequest = {
  encode(message: MuteTrackRequest, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.sid !== '') {
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
      sid: isSet(object.sid) ? String(object.sid) : '',
      muted: isSet(object.muted) ? Boolean(object.muted) : false,
    };
  },

  toJSON(message: MuteTrackRequest): unknown {
    const obj: any = {};
    message.sid !== undefined && (obj.sid = message.sid);
    message.muted !== undefined && (obj.muted = message.muted);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<MuteTrackRequest>, I>>(object: I): MuteTrackRequest {
    const message = createBaseMuteTrackRequest();
    message.sid = object.sid ?? '';
    message.muted = object.muted ?? false;
    return message;
  },
};

function createBaseJoinResponse(): JoinResponse {
  return {
    room: undefined,
    participant: undefined,
    otherParticipants: [],
    serverVersion: '',
    iceServers: [],
    subscriberPrimary: false,
    alternativeUrl: '',
    clientConfiguration: undefined,
    serverRegion: '',
    pingTimeout: 0,
    pingInterval: 0,
  };
}

export const JoinResponse = {
  encode(message: JoinResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.room !== undefined) {
      Room.encode(message.room, writer.uint32(10).fork()).ldelim();
    }
    if (message.participant !== undefined) {
      ParticipantInfo.encode(message.participant, writer.uint32(18).fork()).ldelim();
    }
    for (const v of message.otherParticipants) {
      ParticipantInfo.encode(v!, writer.uint32(26).fork()).ldelim();
    }
    if (message.serverVersion !== '') {
      writer.uint32(34).string(message.serverVersion);
    }
    for (const v of message.iceServers) {
      ICEServer.encode(v!, writer.uint32(42).fork()).ldelim();
    }
    if (message.subscriberPrimary === true) {
      writer.uint32(48).bool(message.subscriberPrimary);
    }
    if (message.alternativeUrl !== '') {
      writer.uint32(58).string(message.alternativeUrl);
    }
    if (message.clientConfiguration !== undefined) {
      ClientConfiguration.encode(message.clientConfiguration, writer.uint32(66).fork()).ldelim();
    }
    if (message.serverRegion !== '') {
      writer.uint32(74).string(message.serverRegion);
    }
    if (message.pingTimeout !== 0) {
      writer.uint32(80).int32(message.pingTimeout);
    }
    if (message.pingInterval !== 0) {
      writer.uint32(88).int32(message.pingInterval);
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
          message.otherParticipants.push(ParticipantInfo.decode(reader, reader.uint32()));
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
          message.clientConfiguration = ClientConfiguration.decode(reader, reader.uint32());
          break;
        case 9:
          message.serverRegion = reader.string();
          break;
        case 10:
          message.pingTimeout = reader.int32();
          break;
        case 11:
          message.pingInterval = reader.int32();
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
      serverVersion: isSet(object.serverVersion) ? String(object.serverVersion) : '',
      iceServers: Array.isArray(object?.iceServers)
        ? object.iceServers.map((e: any) => ICEServer.fromJSON(e))
        : [],
      subscriberPrimary: isSet(object.subscriberPrimary)
        ? Boolean(object.subscriberPrimary)
        : false,
      alternativeUrl: isSet(object.alternativeUrl) ? String(object.alternativeUrl) : '',
      clientConfiguration: isSet(object.clientConfiguration)
        ? ClientConfiguration.fromJSON(object.clientConfiguration)
        : undefined,
      serverRegion: isSet(object.serverRegion) ? String(object.serverRegion) : '',
      pingTimeout: isSet(object.pingTimeout) ? Number(object.pingTimeout) : 0,
      pingInterval: isSet(object.pingInterval) ? Number(object.pingInterval) : 0,
    };
  },

  toJSON(message: JoinResponse): unknown {
    const obj: any = {};
    message.room !== undefined && (obj.room = message.room ? Room.toJSON(message.room) : undefined);
    message.participant !== undefined &&
      (obj.participant = message.participant
        ? ParticipantInfo.toJSON(message.participant)
        : undefined);
    if (message.otherParticipants) {
      obj.otherParticipants = message.otherParticipants.map((e) =>
        e ? ParticipantInfo.toJSON(e) : undefined,
      );
    } else {
      obj.otherParticipants = [];
    }
    message.serverVersion !== undefined && (obj.serverVersion = message.serverVersion);
    if (message.iceServers) {
      obj.iceServers = message.iceServers.map((e) => (e ? ICEServer.toJSON(e) : undefined));
    } else {
      obj.iceServers = [];
    }
    message.subscriberPrimary !== undefined && (obj.subscriberPrimary = message.subscriberPrimary);
    message.alternativeUrl !== undefined && (obj.alternativeUrl = message.alternativeUrl);
    message.clientConfiguration !== undefined &&
      (obj.clientConfiguration = message.clientConfiguration
        ? ClientConfiguration.toJSON(message.clientConfiguration)
        : undefined);
    message.serverRegion !== undefined && (obj.serverRegion = message.serverRegion);
    message.pingTimeout !== undefined && (obj.pingTimeout = Math.round(message.pingTimeout));
    message.pingInterval !== undefined && (obj.pingInterval = Math.round(message.pingInterval));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<JoinResponse>, I>>(object: I): JoinResponse {
    const message = createBaseJoinResponse();
    message.room =
      object.room !== undefined && object.room !== null ? Room.fromPartial(object.room) : undefined;
    message.participant =
      object.participant !== undefined && object.participant !== null
        ? ParticipantInfo.fromPartial(object.participant)
        : undefined;
    message.otherParticipants =
      object.otherParticipants?.map((e) => ParticipantInfo.fromPartial(e)) || [];
    message.serverVersion = object.serverVersion ?? '';
    message.iceServers = object.iceServers?.map((e) => ICEServer.fromPartial(e)) || [];
    message.subscriberPrimary = object.subscriberPrimary ?? false;
    message.alternativeUrl = object.alternativeUrl ?? '';
    message.clientConfiguration =
      object.clientConfiguration !== undefined && object.clientConfiguration !== null
        ? ClientConfiguration.fromPartial(object.clientConfiguration)
        : undefined;
    message.serverRegion = object.serverRegion ?? '';
    message.pingTimeout = object.pingTimeout ?? 0;
    message.pingInterval = object.pingInterval ?? 0;
    return message;
  },
};

function createBaseTrackPublishedResponse(): TrackPublishedResponse {
  return { cid: '', track: undefined };
}

export const TrackPublishedResponse = {
  encode(message: TrackPublishedResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.cid !== '') {
      writer.uint32(10).string(message.cid);
    }
    if (message.track !== undefined) {
      TrackInfo.encode(message.track, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TrackPublishedResponse {
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
      cid: isSet(object.cid) ? String(object.cid) : '',
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
    object: I,
  ): TrackPublishedResponse {
    const message = createBaseTrackPublishedResponse();
    message.cid = object.cid ?? '';
    message.track =
      object.track !== undefined && object.track !== null
        ? TrackInfo.fromPartial(object.track)
        : undefined;
    return message;
  },
};

function createBaseTrackUnpublishedResponse(): TrackUnpublishedResponse {
  return { trackSid: '' };
}

export const TrackUnpublishedResponse = {
  encode(message: TrackUnpublishedResponse, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.trackSid !== '') {
      writer.uint32(10).string(message.trackSid);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): TrackUnpublishedResponse {
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
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : '',
    };
  },

  toJSON(message: TrackUnpublishedResponse): unknown {
    const obj: any = {};
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<TrackUnpublishedResponse>, I>>(
    object: I,
  ): TrackUnpublishedResponse {
    const message = createBaseTrackUnpublishedResponse();
    message.trackSid = object.trackSid ?? '';
    return message;
  },
};

function createBaseSessionDescription(): SessionDescription {
  return { type: '', sdp: '' };
}

export const SessionDescription = {
  encode(message: SessionDescription, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.type !== '') {
      writer.uint32(10).string(message.type);
    }
    if (message.sdp !== '') {
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
      type: isSet(object.type) ? String(object.type) : '',
      sdp: isSet(object.sdp) ? String(object.sdp) : '',
    };
  },

  toJSON(message: SessionDescription): unknown {
    const obj: any = {};
    message.type !== undefined && (obj.type = message.type);
    message.sdp !== undefined && (obj.sdp = message.sdp);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SessionDescription>, I>>(object: I): SessionDescription {
    const message = createBaseSessionDescription();
    message.type = object.type ?? '';
    message.sdp = object.sdp ?? '';
    return message;
  },
};

function createBaseParticipantUpdate(): ParticipantUpdate {
  return { participants: [] };
}

export const ParticipantUpdate = {
  encode(message: ParticipantUpdate, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
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
        e ? ParticipantInfo.toJSON(e) : undefined,
      );
    } else {
      obj.participants = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ParticipantUpdate>, I>>(object: I): ParticipantUpdate {
    const message = createBaseParticipantUpdate();
    message.participants = object.participants?.map((e) => ParticipantInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseUpdateSubscription(): UpdateSubscription {
  return { trackSids: [], subscribe: false, participantTracks: [] };
}

export const UpdateSubscription = {
  encode(message: UpdateSubscription, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
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
          message.participantTracks.push(ParticipantTracks.decode(reader, reader.uint32()));
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
        ? object.participantTracks.map((e: any) => ParticipantTracks.fromJSON(e))
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
        e ? ParticipantTracks.toJSON(e) : undefined,
      );
    } else {
      obj.participantTracks = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<UpdateSubscription>, I>>(object: I): UpdateSubscription {
    const message = createBaseUpdateSubscription();
    message.trackSids = object.trackSids?.map((e) => e) || [];
    message.subscribe = object.subscribe ?? false;
    message.participantTracks =
      object.participantTracks?.map((e) => ParticipantTracks.fromPartial(e)) || [];
    return message;
  },
};

function createBaseUpdateTrackSettings(): UpdateTrackSettings {
  return { trackSids: [], disabled: false, quality: 0, width: 0, height: 0 };
}

export const UpdateTrackSettings = {
  encode(message: UpdateTrackSettings, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
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
    message.quality !== undefined && (obj.quality = videoQualityToJSON(message.quality));
    message.width !== undefined && (obj.width = Math.round(message.width));
    message.height !== undefined && (obj.height = Math.round(message.height));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<UpdateTrackSettings>, I>>(
    object: I,
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
  return { canReconnect: false, reason: 0 };
}

export const LeaveRequest = {
  encode(message: LeaveRequest, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.canReconnect === true) {
      writer.uint32(8).bool(message.canReconnect);
    }
    if (message.reason !== 0) {
      writer.uint32(16).int32(message.reason);
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
        case 2:
          message.reason = reader.int32() as any;
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
      canReconnect: isSet(object.canReconnect) ? Boolean(object.canReconnect) : false,
      reason: isSet(object.reason) ? disconnectReasonFromJSON(object.reason) : 0,
    };
  },

  toJSON(message: LeaveRequest): unknown {
    const obj: any = {};
    message.canReconnect !== undefined && (obj.canReconnect = message.canReconnect);
    message.reason !== undefined && (obj.reason = disconnectReasonToJSON(message.reason));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<LeaveRequest>, I>>(object: I): LeaveRequest {
    const message = createBaseLeaveRequest();
    message.canReconnect = object.canReconnect ?? false;
    message.reason = object.reason ?? 0;
    return message;
  },
};

function createBaseUpdateVideoLayers(): UpdateVideoLayers {
  return { trackSid: '', layers: [] };
}

export const UpdateVideoLayers = {
  encode(message: UpdateVideoLayers, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.trackSid !== '') {
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
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : '',
      layers: Array.isArray(object?.layers)
        ? object.layers.map((e: any) => VideoLayer.fromJSON(e))
        : [],
    };
  },

  toJSON(message: UpdateVideoLayers): unknown {
    const obj: any = {};
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    if (message.layers) {
      obj.layers = message.layers.map((e) => (e ? VideoLayer.toJSON(e) : undefined));
    } else {
      obj.layers = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<UpdateVideoLayers>, I>>(object: I): UpdateVideoLayers {
    const message = createBaseUpdateVideoLayers();
    message.trackSid = object.trackSid ?? '';
    message.layers = object.layers?.map((e) => VideoLayer.fromPartial(e)) || [];
    return message;
  },
};

function createBaseICEServer(): ICEServer {
  return { urls: [], username: '', credential: '' };
}

export const ICEServer = {
  encode(message: ICEServer, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    for (const v of message.urls) {
      writer.uint32(10).string(v!);
    }
    if (message.username !== '') {
      writer.uint32(18).string(message.username);
    }
    if (message.credential !== '') {
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
      urls: Array.isArray(object?.urls) ? object.urls.map((e: any) => String(e)) : [],
      username: isSet(object.username) ? String(object.username) : '',
      credential: isSet(object.credential) ? String(object.credential) : '',
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

  fromPartial<I extends Exact<DeepPartial<ICEServer>, I>>(object: I): ICEServer {
    const message = createBaseICEServer();
    message.urls = object.urls?.map((e) => e) || [];
    message.username = object.username ?? '';
    message.credential = object.credential ?? '';
    return message;
  },
};

function createBaseSpeakersChanged(): SpeakersChanged {
  return { speakers: [] };
}

export const SpeakersChanged = {
  encode(message: SpeakersChanged, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
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
      obj.speakers = message.speakers.map((e) => (e ? SpeakerInfo.toJSON(e) : undefined));
    } else {
      obj.speakers = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SpeakersChanged>, I>>(object: I): SpeakersChanged {
    const message = createBaseSpeakersChanged();
    message.speakers = object.speakers?.map((e) => SpeakerInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseRoomUpdate(): RoomUpdate {
  return { room: undefined };
}

export const RoomUpdate = {
  encode(message: RoomUpdate, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
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
    message.room !== undefined && (obj.room = message.room ? Room.toJSON(message.room) : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<RoomUpdate>, I>>(object: I): RoomUpdate {
    const message = createBaseRoomUpdate();
    message.room =
      object.room !== undefined && object.room !== null ? Room.fromPartial(object.room) : undefined;
    return message;
  },
};

function createBaseConnectionQualityInfo(): ConnectionQualityInfo {
  return { participantSid: '', quality: 0, score: 0 };
}

export const ConnectionQualityInfo = {
  encode(message: ConnectionQualityInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.participantSid !== '') {
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

  decode(input: _m0.Reader | Uint8Array, length?: number): ConnectionQualityInfo {
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
      participantSid: isSet(object.participantSid) ? String(object.participantSid) : '',
      quality: isSet(object.quality) ? connectionQualityFromJSON(object.quality) : 0,
      score: isSet(object.score) ? Number(object.score) : 0,
    };
  },

  toJSON(message: ConnectionQualityInfo): unknown {
    const obj: any = {};
    message.participantSid !== undefined && (obj.participantSid = message.participantSid);
    message.quality !== undefined && (obj.quality = connectionQualityToJSON(message.quality));
    message.score !== undefined && (obj.score = message.score);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ConnectionQualityInfo>, I>>(
    object: I,
  ): ConnectionQualityInfo {
    const message = createBaseConnectionQualityInfo();
    message.participantSid = object.participantSid ?? '';
    message.quality = object.quality ?? 0;
    message.score = object.score ?? 0;
    return message;
  },
};

function createBaseConnectionQualityUpdate(): ConnectionQualityUpdate {
  return { updates: [] };
}

export const ConnectionQualityUpdate = {
  encode(message: ConnectionQualityUpdate, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    for (const v of message.updates) {
      ConnectionQualityInfo.encode(v!, writer.uint32(10).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): ConnectionQualityUpdate {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseConnectionQualityUpdate();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.updates.push(ConnectionQualityInfo.decode(reader, reader.uint32()));
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
      obj.updates = message.updates.map((e) => (e ? ConnectionQualityInfo.toJSON(e) : undefined));
    } else {
      obj.updates = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<ConnectionQualityUpdate>, I>>(
    object: I,
  ): ConnectionQualityUpdate {
    const message = createBaseConnectionQualityUpdate();
    message.updates = object.updates?.map((e) => ConnectionQualityInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseStreamStateInfo(): StreamStateInfo {
  return { participantSid: '', trackSid: '', state: 0 };
}

export const StreamStateInfo = {
  encode(message: StreamStateInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.participantSid !== '') {
      writer.uint32(10).string(message.participantSid);
    }
    if (message.trackSid !== '') {
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
      participantSid: isSet(object.participantSid) ? String(object.participantSid) : '',
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : '',
      state: isSet(object.state) ? streamStateFromJSON(object.state) : 0,
    };
  },

  toJSON(message: StreamStateInfo): unknown {
    const obj: any = {};
    message.participantSid !== undefined && (obj.participantSid = message.participantSid);
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    message.state !== undefined && (obj.state = streamStateToJSON(message.state));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<StreamStateInfo>, I>>(object: I): StreamStateInfo {
    const message = createBaseStreamStateInfo();
    message.participantSid = object.participantSid ?? '';
    message.trackSid = object.trackSid ?? '';
    message.state = object.state ?? 0;
    return message;
  },
};

function createBaseStreamStateUpdate(): StreamStateUpdate {
  return { streamStates: [] };
}

export const StreamStateUpdate = {
  encode(message: StreamStateUpdate, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
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
          message.streamStates.push(StreamStateInfo.decode(reader, reader.uint32()));
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
        e ? StreamStateInfo.toJSON(e) : undefined,
      );
    } else {
      obj.streamStates = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<StreamStateUpdate>, I>>(object: I): StreamStateUpdate {
    const message = createBaseStreamStateUpdate();
    message.streamStates = object.streamStates?.map((e) => StreamStateInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseSubscribedQuality(): SubscribedQuality {
  return { quality: 0, enabled: false };
}

export const SubscribedQuality = {
  encode(message: SubscribedQuality, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
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
    message.quality !== undefined && (obj.quality = videoQualityToJSON(message.quality));
    message.enabled !== undefined && (obj.enabled = message.enabled);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SubscribedQuality>, I>>(object: I): SubscribedQuality {
    const message = createBaseSubscribedQuality();
    message.quality = object.quality ?? 0;
    message.enabled = object.enabled ?? false;
    return message;
  },
};

function createBaseSubscribedCodec(): SubscribedCodec {
  return { codec: '', qualities: [] };
}

export const SubscribedCodec = {
  encode(message: SubscribedCodec, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.codec !== '') {
      writer.uint32(10).string(message.codec);
    }
    for (const v of message.qualities) {
      SubscribedQuality.encode(v!, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SubscribedCodec {
    const reader = input instanceof _m0.Reader ? input : new _m0.Reader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseSubscribedCodec();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          message.codec = reader.string();
          break;
        case 2:
          message.qualities.push(SubscribedQuality.decode(reader, reader.uint32()));
          break;
        default:
          reader.skipType(tag & 7);
          break;
      }
    }
    return message;
  },

  fromJSON(object: any): SubscribedCodec {
    return {
      codec: isSet(object.codec) ? String(object.codec) : '',
      qualities: Array.isArray(object?.qualities)
        ? object.qualities.map((e: any) => SubscribedQuality.fromJSON(e))
        : [],
    };
  },

  toJSON(message: SubscribedCodec): unknown {
    const obj: any = {};
    message.codec !== undefined && (obj.codec = message.codec);
    if (message.qualities) {
      obj.qualities = message.qualities.map((e) => (e ? SubscribedQuality.toJSON(e) : undefined));
    } else {
      obj.qualities = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SubscribedCodec>, I>>(object: I): SubscribedCodec {
    const message = createBaseSubscribedCodec();
    message.codec = object.codec ?? '';
    message.qualities = object.qualities?.map((e) => SubscribedQuality.fromPartial(e)) || [];
    return message;
  },
};

function createBaseSubscribedQualityUpdate(): SubscribedQualityUpdate {
  return { trackSid: '', subscribedQualities: [], subscribedCodecs: [] };
}

export const SubscribedQualityUpdate = {
  encode(message: SubscribedQualityUpdate, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.trackSid !== '') {
      writer.uint32(10).string(message.trackSid);
    }
    for (const v of message.subscribedQualities) {
      SubscribedQuality.encode(v!, writer.uint32(18).fork()).ldelim();
    }
    for (const v of message.subscribedCodecs) {
      SubscribedCodec.encode(v!, writer.uint32(26).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SubscribedQualityUpdate {
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
          message.subscribedQualities.push(SubscribedQuality.decode(reader, reader.uint32()));
          break;
        case 3:
          message.subscribedCodecs.push(SubscribedCodec.decode(reader, reader.uint32()));
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
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : '',
      subscribedQualities: Array.isArray(object?.subscribedQualities)
        ? object.subscribedQualities.map((e: any) => SubscribedQuality.fromJSON(e))
        : [],
      subscribedCodecs: Array.isArray(object?.subscribedCodecs)
        ? object.subscribedCodecs.map((e: any) => SubscribedCodec.fromJSON(e))
        : [],
    };
  },

  toJSON(message: SubscribedQualityUpdate): unknown {
    const obj: any = {};
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    if (message.subscribedQualities) {
      obj.subscribedQualities = message.subscribedQualities.map((e) =>
        e ? SubscribedQuality.toJSON(e) : undefined,
      );
    } else {
      obj.subscribedQualities = [];
    }
    if (message.subscribedCodecs) {
      obj.subscribedCodecs = message.subscribedCodecs.map((e) =>
        e ? SubscribedCodec.toJSON(e) : undefined,
      );
    } else {
      obj.subscribedCodecs = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SubscribedQualityUpdate>, I>>(
    object: I,
  ): SubscribedQualityUpdate {
    const message = createBaseSubscribedQualityUpdate();
    message.trackSid = object.trackSid ?? '';
    message.subscribedQualities =
      object.subscribedQualities?.map((e) => SubscribedQuality.fromPartial(e)) || [];
    message.subscribedCodecs =
      object.subscribedCodecs?.map((e) => SubscribedCodec.fromPartial(e)) || [];
    return message;
  },
};

function createBaseTrackPermission(): TrackPermission {
  return { participantSid: '', allTracks: false, trackSids: [], participantIdentity: '' };
}

export const TrackPermission = {
  encode(message: TrackPermission, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.participantSid !== '') {
      writer.uint32(10).string(message.participantSid);
    }
    if (message.allTracks === true) {
      writer.uint32(16).bool(message.allTracks);
    }
    for (const v of message.trackSids) {
      writer.uint32(26).string(v!);
    }
    if (message.participantIdentity !== '') {
      writer.uint32(34).string(message.participantIdentity);
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
        case 4:
          message.participantIdentity = reader.string();
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
      participantSid: isSet(object.participantSid) ? String(object.participantSid) : '',
      allTracks: isSet(object.allTracks) ? Boolean(object.allTracks) : false,
      trackSids: Array.isArray(object?.trackSids)
        ? object.trackSids.map((e: any) => String(e))
        : [],
      participantIdentity: isSet(object.participantIdentity)
        ? String(object.participantIdentity)
        : '',
    };
  },

  toJSON(message: TrackPermission): unknown {
    const obj: any = {};
    message.participantSid !== undefined && (obj.participantSid = message.participantSid);
    message.allTracks !== undefined && (obj.allTracks = message.allTracks);
    if (message.trackSids) {
      obj.trackSids = message.trackSids.map((e) => e);
    } else {
      obj.trackSids = [];
    }
    message.participantIdentity !== undefined &&
      (obj.participantIdentity = message.participantIdentity);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<TrackPermission>, I>>(object: I): TrackPermission {
    const message = createBaseTrackPermission();
    message.participantSid = object.participantSid ?? '';
    message.allTracks = object.allTracks ?? false;
    message.trackSids = object.trackSids?.map((e) => e) || [];
    message.participantIdentity = object.participantIdentity ?? '';
    return message;
  },
};

function createBaseSubscriptionPermission(): SubscriptionPermission {
  return { allParticipants: false, trackPermissions: [] };
}

export const SubscriptionPermission = {
  encode(message: SubscriptionPermission, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.allParticipants === true) {
      writer.uint32(8).bool(message.allParticipants);
    }
    for (const v of message.trackPermissions) {
      TrackPermission.encode(v!, writer.uint32(18).fork()).ldelim();
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SubscriptionPermission {
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
          message.trackPermissions.push(TrackPermission.decode(reader, reader.uint32()));
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
      allParticipants: isSet(object.allParticipants) ? Boolean(object.allParticipants) : false,
      trackPermissions: Array.isArray(object?.trackPermissions)
        ? object.trackPermissions.map((e: any) => TrackPermission.fromJSON(e))
        : [],
    };
  },

  toJSON(message: SubscriptionPermission): unknown {
    const obj: any = {};
    message.allParticipants !== undefined && (obj.allParticipants = message.allParticipants);
    if (message.trackPermissions) {
      obj.trackPermissions = message.trackPermissions.map((e) =>
        e ? TrackPermission.toJSON(e) : undefined,
      );
    } else {
      obj.trackPermissions = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SubscriptionPermission>, I>>(
    object: I,
  ): SubscriptionPermission {
    const message = createBaseSubscriptionPermission();
    message.allParticipants = object.allParticipants ?? false;
    message.trackPermissions =
      object.trackPermissions?.map((e) => TrackPermission.fromPartial(e)) || [];
    return message;
  },
};

function createBaseSubscriptionPermissionUpdate(): SubscriptionPermissionUpdate {
  return { participantSid: '', trackSid: '', allowed: false };
}

export const SubscriptionPermissionUpdate = {
  encode(
    message: SubscriptionPermissionUpdate,
    writer: _m0.Writer = _m0.Writer.create(),
  ): _m0.Writer {
    if (message.participantSid !== '') {
      writer.uint32(10).string(message.participantSid);
    }
    if (message.trackSid !== '') {
      writer.uint32(18).string(message.trackSid);
    }
    if (message.allowed === true) {
      writer.uint32(24).bool(message.allowed);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): SubscriptionPermissionUpdate {
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
      participantSid: isSet(object.participantSid) ? String(object.participantSid) : '',
      trackSid: isSet(object.trackSid) ? String(object.trackSid) : '',
      allowed: isSet(object.allowed) ? Boolean(object.allowed) : false,
    };
  },

  toJSON(message: SubscriptionPermissionUpdate): unknown {
    const obj: any = {};
    message.participantSid !== undefined && (obj.participantSid = message.participantSid);
    message.trackSid !== undefined && (obj.trackSid = message.trackSid);
    message.allowed !== undefined && (obj.allowed = message.allowed);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SubscriptionPermissionUpdate>, I>>(
    object: I,
  ): SubscriptionPermissionUpdate {
    const message = createBaseSubscriptionPermissionUpdate();
    message.participantSid = object.participantSid ?? '';
    message.trackSid = object.trackSid ?? '';
    message.allowed = object.allowed ?? false;
    return message;
  },
};

function createBaseSyncState(): SyncState {
  return { answer: undefined, subscription: undefined, publishTracks: [], dataChannels: [] };
}

export const SyncState = {
  encode(message: SyncState, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.answer !== undefined) {
      SessionDescription.encode(message.answer, writer.uint32(10).fork()).ldelim();
    }
    if (message.subscription !== undefined) {
      UpdateSubscription.encode(message.subscription, writer.uint32(18).fork()).ldelim();
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
          message.subscription = UpdateSubscription.decode(reader, reader.uint32());
          break;
        case 3:
          message.publishTracks.push(TrackPublishedResponse.decode(reader, reader.uint32()));
          break;
        case 4:
          message.dataChannels.push(DataChannelInfo.decode(reader, reader.uint32()));
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
      answer: isSet(object.answer) ? SessionDescription.fromJSON(object.answer) : undefined,
      subscription: isSet(object.subscription)
        ? UpdateSubscription.fromJSON(object.subscription)
        : undefined,
      publishTracks: Array.isArray(object?.publishTracks)
        ? object.publishTracks.map((e: any) => TrackPublishedResponse.fromJSON(e))
        : [],
      dataChannels: Array.isArray(object?.dataChannels)
        ? object.dataChannels.map((e: any) => DataChannelInfo.fromJSON(e))
        : [],
    };
  },

  toJSON(message: SyncState): unknown {
    const obj: any = {};
    message.answer !== undefined &&
      (obj.answer = message.answer ? SessionDescription.toJSON(message.answer) : undefined);
    message.subscription !== undefined &&
      (obj.subscription = message.subscription
        ? UpdateSubscription.toJSON(message.subscription)
        : undefined);
    if (message.publishTracks) {
      obj.publishTracks = message.publishTracks.map((e) =>
        e ? TrackPublishedResponse.toJSON(e) : undefined,
      );
    } else {
      obj.publishTracks = [];
    }
    if (message.dataChannels) {
      obj.dataChannels = message.dataChannels.map((e) =>
        e ? DataChannelInfo.toJSON(e) : undefined,
      );
    } else {
      obj.dataChannels = [];
    }
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SyncState>, I>>(object: I): SyncState {
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
      object.publishTracks?.map((e) => TrackPublishedResponse.fromPartial(e)) || [];
    message.dataChannels = object.dataChannels?.map((e) => DataChannelInfo.fromPartial(e)) || [];
    return message;
  },
};

function createBaseDataChannelInfo(): DataChannelInfo {
  return { label: '', id: 0, target: 0 };
}

export const DataChannelInfo = {
  encode(message: DataChannelInfo, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.label !== '') {
      writer.uint32(10).string(message.label);
    }
    if (message.id !== 0) {
      writer.uint32(16).uint32(message.id);
    }
    if (message.target !== 0) {
      writer.uint32(24).int32(message.target);
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
        case 3:
          message.target = reader.int32() as any;
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
      label: isSet(object.label) ? String(object.label) : '',
      id: isSet(object.id) ? Number(object.id) : 0,
      target: isSet(object.target) ? signalTargetFromJSON(object.target) : 0,
    };
  },

  toJSON(message: DataChannelInfo): unknown {
    const obj: any = {};
    message.label !== undefined && (obj.label = message.label);
    message.id !== undefined && (obj.id = Math.round(message.id));
    message.target !== undefined && (obj.target = signalTargetToJSON(message.target));
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<DataChannelInfo>, I>>(object: I): DataChannelInfo {
    const message = createBaseDataChannelInfo();
    message.label = object.label ?? '';
    message.id = object.id ?? 0;
    message.target = object.target ?? 0;
    return message;
  },
};

function createBaseSimulateScenario(): SimulateScenario {
  return { scenario: undefined };
}

export const SimulateScenario = {
  encode(message: SimulateScenario, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.scenario?.$case === 'speakerUpdate') {
      writer.uint32(8).int32(message.scenario.speakerUpdate);
    }
    if (message.scenario?.$case === 'nodeFailure') {
      writer.uint32(16).bool(message.scenario.nodeFailure);
    }
    if (message.scenario?.$case === 'migration') {
      writer.uint32(24).bool(message.scenario.migration);
    }
    if (message.scenario?.$case === 'serverLeave') {
      writer.uint32(32).bool(message.scenario.serverLeave);
    }
    if (message.scenario?.$case === 'switchCandidateProtocol') {
      writer.uint32(40).int32(message.scenario.switchCandidateProtocol);
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
          message.scenario = { $case: 'speakerUpdate', speakerUpdate: reader.int32() };
          break;
        case 2:
          message.scenario = { $case: 'nodeFailure', nodeFailure: reader.bool() };
          break;
        case 3:
          message.scenario = { $case: 'migration', migration: reader.bool() };
          break;
        case 4:
          message.scenario = { $case: 'serverLeave', serverLeave: reader.bool() };
          break;
        case 5:
          message.scenario = {
            $case: 'switchCandidateProtocol',
            switchCandidateProtocol: reader.int32() as any,
          };
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
      scenario: isSet(object.speakerUpdate)
        ? { $case: 'speakerUpdate', speakerUpdate: Number(object.speakerUpdate) }
        : isSet(object.nodeFailure)
        ? { $case: 'nodeFailure', nodeFailure: Boolean(object.nodeFailure) }
        : isSet(object.migration)
        ? { $case: 'migration', migration: Boolean(object.migration) }
        : isSet(object.serverLeave)
        ? { $case: 'serverLeave', serverLeave: Boolean(object.serverLeave) }
        : isSet(object.switchCandidateProtocol)
        ? {
            $case: 'switchCandidateProtocol',
            switchCandidateProtocol: candidateProtocolFromJSON(object.switchCandidateProtocol),
          }
        : undefined,
    };
  },

  toJSON(message: SimulateScenario): unknown {
    const obj: any = {};
    message.scenario?.$case === 'speakerUpdate' &&
      (obj.speakerUpdate = Math.round(message.scenario?.speakerUpdate));
    message.scenario?.$case === 'nodeFailure' && (obj.nodeFailure = message.scenario?.nodeFailure);
    message.scenario?.$case === 'migration' && (obj.migration = message.scenario?.migration);
    message.scenario?.$case === 'serverLeave' && (obj.serverLeave = message.scenario?.serverLeave);
    message.scenario?.$case === 'switchCandidateProtocol' &&
      (obj.switchCandidateProtocol =
        message.scenario?.switchCandidateProtocol !== undefined
          ? candidateProtocolToJSON(message.scenario?.switchCandidateProtocol)
          : undefined);
    return obj;
  },

  fromPartial<I extends Exact<DeepPartial<SimulateScenario>, I>>(object: I): SimulateScenario {
    const message = createBaseSimulateScenario();
    if (
      object.scenario?.$case === 'speakerUpdate' &&
      object.scenario?.speakerUpdate !== undefined &&
      object.scenario?.speakerUpdate !== null
    ) {
      message.scenario = { $case: 'speakerUpdate', speakerUpdate: object.scenario.speakerUpdate };
    }
    if (
      object.scenario?.$case === 'nodeFailure' &&
      object.scenario?.nodeFailure !== undefined &&
      object.scenario?.nodeFailure !== null
    ) {
      message.scenario = { $case: 'nodeFailure', nodeFailure: object.scenario.nodeFailure };
    }
    if (
      object.scenario?.$case === 'migration' &&
      object.scenario?.migration !== undefined &&
      object.scenario?.migration !== null
    ) {
      message.scenario = { $case: 'migration', migration: object.scenario.migration };
    }
    if (
      object.scenario?.$case === 'serverLeave' &&
      object.scenario?.serverLeave !== undefined &&
      object.scenario?.serverLeave !== null
    ) {
      message.scenario = { $case: 'serverLeave', serverLeave: object.scenario.serverLeave };
    }
    if (
      object.scenario?.$case === 'switchCandidateProtocol' &&
      object.scenario?.switchCandidateProtocol !== undefined &&
      object.scenario?.switchCandidateProtocol !== null
    ) {
      message.scenario = {
        $case: 'switchCandidateProtocol',
        switchCandidateProtocol: object.scenario.switchCandidateProtocol,
      };
    }
    return message;
  },
};

declare var self: any | undefined;
declare var window: any | undefined;
declare var global: any | undefined;
var globalThis: any = (() => {
  if (typeof globalThis !== 'undefined') return globalThis;
  if (typeof self !== 'undefined') return self;
  if (typeof window !== 'undefined') return window;
  if (typeof global !== 'undefined') return global;
  throw 'Unable to locate global object';
})();

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin
  ? T
  : T extends Array<infer U>
  ? Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U>
  ? ReadonlyArray<DeepPartial<U>>
  : T extends { $case: string }
  ? { [K in keyof Omit<T, '$case'>]?: DeepPartial<T[K]> } & { $case: T['$case'] }
  : T extends {}
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin
  ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & Record<Exclude<keyof I, KeysOfUnion<P>>, never>;

function longToNumber(long: Long): number {
  if (long.gt(Number.MAX_SAFE_INTEGER)) {
    throw new globalThis.Error('Value is larger than Number.MAX_SAFE_INTEGER');
  }
  return long.toNumber();
}

if (_m0.util.Long !== Long) {
  _m0.util.Long = Long as any;
  _m0.configure();
}

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}
