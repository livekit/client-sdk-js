import type {
  ConnectionQualityUpdate,
  DataTrackSubscriberHandles,
  JoinResponse,
  LeaveRequest,
  MediaSectionsRequirement,
  ParticipantInfo,
  PublishDataTrackResponse,
  RequestResponse,
  Room,
  RoomMovedResponse,
  SignalTarget,
  SpeakerInfo,
  StreamStateUpdate,
  SubscribedQualityUpdate,
  SubscriptionPermissionUpdate,
  SubscriptionResponse,
  TrackPublishedResponse,
  TrackUnpublishedResponse,
  UnpublishDataTrackResponse,
} from '@livekit/protocol';

export type SignalClientCallbacks = {
  /** The transport was lost without the client asking for it. */
  close: (reason: string) => void;
  /** The join response arrived, before `join()` resolves. */
  joined: (joinResponse: JoinResponse) => void;
  answer: (
    sd: RTCSessionDescriptionInit,
    offerId: number,
    midToTrackId: { [key: string]: string },
  ) => void;
  offer: (
    sd: RTCSessionDescriptionInit,
    offerId: number,
    midToTrackId: { [key: string]: string },
  ) => void;
  /** The server sent an ICE candidate. */
  trickle: (candidate: RTCIceCandidateInit, target: SignalTarget) => void;
  participantUpdate: (updates: ParticipantInfo[]) => void;
  localTrackPublished: (res: TrackPublishedResponse) => void;
  localTrackUnpublished: (res: TrackUnpublishedResponse) => void;
  localTrackSubscribed: (trackSid: string) => void;
  speakersChanged: (speakers: SpeakerInfo[]) => void;
  remoteMuteChanged: (trackSid: string, muted: boolean) => void;
  roomUpdate: (room: Room) => void;
  connectionQuality: (update: ConnectionQualityUpdate) => void;
  streamStateUpdate: (update: StreamStateUpdate) => void;
  subscribedQualityUpdate: (update: SubscribedQualityUpdate) => void;
  subscriptionPermissionUpdate: (update: SubscriptionPermissionUpdate) => void;
  subscriptionError: (res: SubscriptionResponse) => void;
  /** A `refreshToken` message, or the new token carried by a `roomMoved` message. */
  tokenRefresh: (token: string) => void;
  leave: (leave: LeaveRequest) => void;
  requestResponse: (response: RequestResponse) => void;
  roomMoved: (res: RoomMovedResponse) => void;
  mediaSectionsRequirement: (requirement: MediaSectionsRequirement) => void;
  publishDataTrackResponse: (res: PublishDataTrackResponse) => void;
  unpublishDataTrackResponse: (res: UnpublishDataTrackResponse) => void;
  dataTrackSubscriberHandles: (handles: DataTrackSubscriberHandles) => void;
};
