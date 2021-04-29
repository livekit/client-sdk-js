/**
 * Events are the primary way LiveKit notifies your application of changes.
 *
 * The following are events emitted by [[Room]], listen to room events like
 *
 * ```typescript
 * room.on(RoomEvent.TrackPublished, (track, publication, participant) => {})
 * ```
 */
export enum RoomEvent {
  /**
   * When disconnected from room
   */
  Disconnected = 'disconnected',

  /**
   * When a [[RemoteParticipant]] joins *after* the local
   * participant. It will not emit events for participants that are already
   * in the room
   *
   * args: ([[RemoteParticipant]])
   */
  ParticipantConnected = 'participantConnected',

  /**
   * When a [[RemoteParticipant]] leaves *after* the local
   * participant has joined.
   *
   * args: ([[RemoteParticipant]])
   */
  ParticipantDisconnected = 'participantDisconnected',

  /**
   * When a new track is published to room *after* the local
   * participant has joined. It will not fire for tracks that are already published
   *
   * args: ([[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  TrackPublished = 'trackPublished',

  /**
   * The [[LocalParticipant]] has subscribed to a new track. This event will **always**
   * fire as long as new tracks are ready for use.
   *
   * args: ([[RemoteTrack]], [[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  TrackSubscribed = 'trackSubscribed',

  /**
   * Could not subscribe to a track
   *
   * args: (track sid, [[RemoteParticipant]])
   */
  TrackSubscriptionFailed = 'trackSubscriptionFailed',

  /**
   * A [[RemoteParticipant]] has unpublished a track
   *
   * args: ([[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  TrackUnpublished = 'trackUnpublished',

  /**
   * A subscribed track is no longer available. Clients should listen to this
   * event and ensure they detach tracks.
   *
   * args: ([[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  TrackUnsubscribed = 'trackUnsubscribed',

  /**
   * A track that was muted by [[RemoteParticipant]]
   *
   * args: ([[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  TrackMuted = 'trackMuted',

  /**
   * A track that was unmuted by [[RemoteParticipant]]
   *
   * args: ([[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  TrackUnmuted = 'trackUnmuted',

  /**
   * Active speakers changed. List of speakers are ordered by their audio level.
   * loudest speakers first. This will include the LocalParticipant too.
   *
   * args: (Array<[[Participant]]>)
   */
  ActiveSpeakersChanged = 'activeSpeakersChanged',

  /**
   * Participant metadata is a simple way for app-specific state to be pushed to
   * all users.
   * When RoomService.UpdateParticipantMetadata is called to change a participant's
   * state, *all*  participants in the room will fire this event.
   *
   * args: (prevMetadata: string, [[Participant]])
   */
  MetadataChanged = 'metadataChanged',

  /**
   * Data received from another participant.
   * Data packets provides the ability to use LiveKit to send/receive arbitrary payloads.
   * All participants in the room will receive the messages sent to the room.
   *
   * args (payload: Uint8Array, participant: [[Participant]], kind: [[DataPacket_Kind]])
   */
  DataReceived = 'dataReceived',
}

export enum ParticipantEvent {
  TrackPublished = 'trackPublished',
  TrackSubscribed = 'trackSubscribed',
  TrackSubscriptionFailed = 'trackSubscriptionFailed',
  TrackUnpublished = 'trackUnpublished',
  TrackUnsubscribed = 'trackUnsubscribed',
  TrackMuted = 'trackMuted',
  TrackUnmuted = 'trackUnmuted',
  MetadataChanged = 'metadataChanged',
  DataReceived = 'dataReceived',
}

/** @internal */
export enum EngineEvent {
  Connected = 'connected',
  Disconnected = 'disconnected',
  ParticipantUpdate = 'participantUpdate',
  MediaTrackAdded = 'mediaTrackAdded',
  SpeakersUpdate = 'speakersUpdate',
  DataPacketReceived = 'dataPacketReceived',
}

export enum TrackEvent {
  Message = 'message',
  Muted = 'muted',
  Unmuted = 'unmuted',
  /** @internal */
  UpdateSettings = 'updateSettings',
  /** @internal */
  UpdateSubscription = 'updateSubscription',
}
