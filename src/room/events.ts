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
   * A subscribed track is no longer availablle. Clients should listent to this
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
   * a message received over a [[DataTrack]]
   *
   * args: (data, [[RemoteDataTrack]], [[RemoteParticipant]])
   */
  TrackMessage = 'trackMessage',

  /**
   * Active speakers changed. List of speakers are ordered by their audio level.
   * loudest speakers first. This will include the LocalParticipant too.
   *
   * args: (Array<[[Participant]]>)
   */
  ActiveSpeakersChanged = 'activeSpeakersChanged',
}

export enum ParticipantEvent {
  TrackPublished = 'trackPublished',
  TrackSubscribed = 'trackSubscribed',
  TrackSubscriptionFailed = 'trackSubscriptionFailed',
  TrackUnpublished = 'trackUnpublished',
  TrackUnsubscribed = 'trackUnsubscribed',
  TrackMuted = 'trackMuted',
  TrackUnmuted = 'trackUnmuted',
  TrackMessage = 'trackMessage',
}

/** @internal */
export enum EngineEvent {
  Connected = 'connected',
  Disconnected = 'disconnected',
  ParticipantUpdate = 'participantUpdate',
  MediaTrackAdded = 'mediaTrackAdded',
  DataChannelAdded = 'dataChannelAdded',
  SpeakersUpdate = 'speakersUpdate',
}

export enum TrackEvent {
  Message = 'message',
  Muted = 'muted',
  Unmuted = 'unmuted',
}
