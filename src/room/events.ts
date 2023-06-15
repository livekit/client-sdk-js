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
   * When the connection to the server has been established
   */
  Connected = 'connected',

  /**
   * When the connection to the server has been interrupted and it's attempting
   * to reconnect.
   */
  Reconnecting = 'reconnecting',

  /**
   * Fires when a reconnection has been successful.
   */
  Reconnected = 'reconnected',

  /**
   * When disconnected from room. This fires when room.disconnect() is called or
   * when an unrecoverable connection issue had occured
   */
  Disconnected = 'disconnected',

  /**
   * Whenever the connection state of the room changes
   *
   * args: ([[ConnectionState]])
   */
  ConnectionStateChanged = 'connectionStateChanged',

  /**
   * @deprecated StateChanged has been renamed to ConnectionStateChanged
   */
  StateChanged = 'connectionStateChanged',

  /**
   * When input or output devices on the machine have changed.
   */
  MediaDevicesChanged = 'mediaDevicesChanged',

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
   * participant has joined. It will not fire for tracks that are already published.
   *
   * A track published doesn't mean the participant has subscribed to it. It's
   * simply reflecting the state of the room.
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
   * args: ([[Track]], [[RemoteTrackPublication]], [[RemoteParticipant]])
   */
  TrackUnsubscribed = 'trackUnsubscribed',

  /**
   * A track that was muted, fires on both [[RemoteParticipant]]s and [[LocalParticipant]]
   *
   * args: ([[TrackPublication]], [[Participant]])
   */
  TrackMuted = 'trackMuted',

  /**
   * A track that was unmuted, fires on both [[RemoteParticipant]]s and [[LocalParticipant]]
   *
   * args: ([[TrackPublication]], [[Participant]])
   */
  TrackUnmuted = 'trackUnmuted',

  /**
   * A local track was published successfully. This event is helpful to know
   * when to update your local UI with the newly published track.
   *
   * args: ([[LocalTrackPublication]], [[LocalParticipant]])
   */
  LocalTrackPublished = 'localTrackPublished',

  /**
   * A local track was unpublished. This event is helpful to know when to remove
   * the local track from your UI.
   *
   * When a user stops sharing their screen by pressing "End" on the browser UI,
   * this event will also fire.
   *
   * args: ([[LocalTrackPublication]], [[LocalParticipant]])
   */
  LocalTrackUnpublished = 'localTrackUnpublished',

  /**
   * When a local audio track is published the SDK checks whether there is complete silence
   * on that track and emits the LocalAudioSilenceDetected event in that case.
   * This allows for applications to show UI informing users that they might have to
   * reset their audio hardware or check for proper device connectivity.
   */
  LocalAudioSilenceDetected = 'localAudioSilenceDetected',

  /**
   * Active speakers changed. List of speakers are ordered by their audio level.
   * loudest speakers first. This will include the LocalParticipant too.
   *
   * Speaker updates are sent only to the publishing participant and their subscribers.
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
   *
   */
  ParticipantMetadataChanged = 'participantMetadataChanged',

  /**
   * Participant's display name changed
   *
   * args: (name: string, [[Participant]])
   *
   */
  ParticipantNameChanged = 'participantNameChanged',

  /**
   * Room metadata is a simple way for app-specific state to be pushed to
   * all users.
   * When RoomService.UpdateRoomMetadata is called to change a room's state,
   * *all*  participants in the room will fire this event.
   *
   * args: (string)
   */
  RoomMetadataChanged = 'roomMetadataChanged',

  /**
   * Data received from another participant.
   * Data packets provides the ability to use LiveKit to send/receive arbitrary payloads.
   * All participants in the room will receive the messages sent to the room.
   *
   * args: (payload: Uint8Array, participant: [[Participant]], kind: [[DataPacket_Kind]], topic?: string)
   */
  DataReceived = 'dataReceived',

  /**
   * Connection quality was changed for a Participant. It'll receive updates
   * from the local participant, as well as any [[RemoteParticipant]]s that we are
   * subscribed to.
   *
   * args: (connectionQuality: [[ConnectionQuality]], participant: [[Participant]])
   */
  ConnectionQualityChanged = 'connectionQualityChanged',

  /**
   * StreamState indicates if a subscribed (remote) track has been paused by the SFU
   * (typically this happens because of subscriber's bandwidth constraints)
   *
   * When bandwidth conditions allow, the track will be resumed automatically.
   * TrackStreamStateChanged will also be emitted when that happens.
   *
   * args: (pub: [[RemoteTrackPublication]], streamState: [[Track.StreamState]],
   *        participant: [[RemoteParticipant]])
   */
  TrackStreamStateChanged = 'trackStreamStateChanged',

  /**
   * One of subscribed tracks have changed its permissions for the current
   * participant. If permission was revoked, then the track will no longer
   * be subscribed. If permission was granted, a TrackSubscribed event will
   * be emitted.
   *
   * args: (pub: [[RemoteTrackPublication]],
   *        status: [[TrackPublication.SubscriptionStatus]],
   *        participant: [[RemoteParticipant]])
   */
  TrackSubscriptionPermissionChanged = 'trackSubscriptionPermissionChanged',

  /**
   * One of subscribed tracks have changed its status for the current
   * participant.
   *
   * args: (pub: [[RemoteTrackPublication]],
   *        status: [[TrackPublication.SubscriptionStatus]],
   *        participant: [[RemoteParticipant]])
   */
  TrackSubscriptionStatusChanged = 'trackSubscriptionStatusChanged',

  /**
   * LiveKit will attempt to autoplay all audio tracks when you attach them to
   * audio elements. However, if that fails, we'll notify you via AudioPlaybackStatusChanged.
   * `Room.canPlayAudio` will indicate if audio playback is permitted.
   */
  AudioPlaybackStatusChanged = 'audioPlaybackChanged',

  /**
   * When we have encountered an error while attempting to create a track.
   * The errors take place in getUserMedia().
   * Use MediaDeviceFailure.getFailure(error) to get the reason of failure.
   * [[LocalParticipant.lastCameraError]] and [[LocalParticipant.lastMicrophoneError]]
   * will indicate if it had an error while creating the audio or video track respectively.
   *
   * args: (error: Error)
   */
  MediaDevicesError = 'mediaDevicesError',

  /**
   * A participant's permission has changed. Currently only fired on LocalParticipant.
   * args: (prevPermissions: [[ParticipantPermission]], participant: [[Participant]])
   */
  ParticipantPermissionsChanged = 'participantPermissionsChanged',

  /**
   * Signal connected, can publish tracks.
   */
  SignalConnected = 'signalConnected',

  /**
   * Recording of a room has started/stopped. Room.isRecording will be updated too.
   * args: (isRecording: boolean)
   */
  RecordingStatusChanged = 'recordingStatusChanged',

  /**
   * Emits whenever the current buffer status of a data channel changes
   * args: (isLow: boolean, kind: [[DataPacket_Kind]])
   */
  DCBufferStatusChanged = 'dcBufferStatusChanged',

  /**
   * Triggered by a call to room.switchActiveDevice
   * args: (kind: MediaDeviceKind, deviceId: string)
   */
  ActiveDeviceChanged = 'activeDeviceChanged',
}

export enum ParticipantEvent {
  /**
   * When a new track is published to room *after* the local
   * participant has joined. It will not fire for tracks that are already published.
   *
   * A track published doesn't mean the participant has subscribed to it. It's
   * simply reflecting the state of the room.
   *
   * args: ([[RemoteTrackPublication]])
   */
  TrackPublished = 'trackPublished',

  /**
   * Successfully subscribed to the [[RemoteParticipant]]'s track.
   * This event will **always** fire as long as new tracks are ready for use.
   *
   * args: ([[RemoteTrack]], [[RemoteTrackPublication]])
   */
  TrackSubscribed = 'trackSubscribed',

  /**
   * Could not subscribe to a track
   *
   * args: (track sid)
   */
  TrackSubscriptionFailed = 'trackSubscriptionFailed',

  /**
   * A [[RemoteParticipant]] has unpublished a track
   *
   * args: ([[RemoteTrackPublication]])
   */
  TrackUnpublished = 'trackUnpublished',

  /**
   * A subscribed track is no longer available. Clients should listen to this
   * event and ensure they detach tracks.
   *
   * args: ([[RemoteTrack]], [[RemoteTrackPublication]])
   */
  TrackUnsubscribed = 'trackUnsubscribed',

  /**
   * A track that was muted, fires on both [[RemoteParticipant]]s and [[LocalParticipant]]
   *
   * args: ([[TrackPublication]])
   */
  TrackMuted = 'trackMuted',

  /**
   * A track that was unmuted, fires on both [[RemoteParticipant]]s and [[LocalParticipant]]
   *
   * args: ([[TrackPublication]])
   */
  TrackUnmuted = 'trackUnmuted',

  /**
   * A local track was published successfully. This event is helpful to know
   * when to update your local UI with the newly published track.
   *
   * args: ([[LocalTrackPublication]])
   */
  LocalTrackPublished = 'localTrackPublished',

  /**
   * A local track was unpublished. This event is helpful to know when to remove
   * the local track from your UI.
   *
   * When a user stops sharing their screen by pressing "End" on the browser UI,
   * this event will also fire.
   *
   * args: ([[LocalTrackPublication]])
   */
  LocalTrackUnpublished = 'localTrackUnpublished',

  /**
   * Participant metadata is a simple way for app-specific state to be pushed to
   * all users.
   * When RoomService.UpdateParticipantMetadata is called to change a participant's
   * state, *all*  participants in the room will fire this event.
   * To access the current metadata, see [[Participant.metadata]].
   *
   * args: (prevMetadata: string)
   *
   */
  ParticipantMetadataChanged = 'participantMetadataChanged',

  /**
   * Participant's display name changed
   *
   * args: (name: string, [[Participant]])
   *
   */
  ParticipantNameChanged = 'participantNameChanged',

  /**
   * Data received from this participant as sender.
   * Data packets provides the ability to use LiveKit to send/receive arbitrary payloads.
   * All participants in the room will receive the messages sent to the room.
   *
   * args: (payload: Uint8Array, kind: [[DataPacket_Kind]])
   */
  DataReceived = 'dataReceived',

  /**
   * Has speaking status changed for the current participant
   *
   * args: (speaking: boolean)
   */
  IsSpeakingChanged = 'isSpeakingChanged',

  /**
   * Connection quality was changed for a Participant. It'll receive updates
   * from the local participant, as well as any [[RemoteParticipant]]s that we are
   * subscribed to.
   *
   * args: (connectionQuality: [[ConnectionQuality]])
   */
  ConnectionQualityChanged = 'connectionQualityChanged',

  /**
   * StreamState indicates if a subscribed track has been paused by the SFU
   * (typically this happens because of subscriber's bandwidth constraints)
   *
   * When bandwidth conditions allow, the track will be resumed automatically.
   * TrackStreamStateChanged will also be emitted when that happens.
   *
   * args: (pub: [[RemoteTrackPublication]], streamState: [[Track.StreamState]])
   */
  TrackStreamStateChanged = 'trackStreamStateChanged',

  /**
   * One of subscribed tracks have changed its permissions for the current
   * participant. If permission was revoked, then the track will no longer
   * be subscribed. If permission was granted, a TrackSubscribed event will
   * be emitted.
   *
   * args: (pub: [[RemoteTrackPublication]],
   *        status: [[TrackPublication.SubscriptionStatus]])
   */
  TrackSubscriptionPermissionChanged = 'trackSubscriptionPermissionChanged',

  /**
   * One of the remote participants publications has changed its subscription status.
   *
   */
  TrackSubscriptionStatusChanged = 'trackSubscriptionStatusChanged',

  // fired only on LocalParticipant
  /** @internal */
  MediaDevicesError = 'mediaDevicesError',

  /**
   * A participant's permission has changed. Currently only fired on LocalParticipant.
   * args: (prevPermissions: [[ParticipantPermission]])
   */
  ParticipantPermissionsChanged = 'participantPermissionsChanged',
}

/** @internal */
export enum EngineEvent {
  TransportsCreated = 'transportsCreated',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Resuming = 'resuming',
  Resumed = 'resumed',
  Restarting = 'restarting',
  Restarted = 'restarted',
  SignalResumed = 'signalResumed',
  SignalRestarted = 'signalRestarted',
  Closing = 'closing',
  MediaTrackAdded = 'mediaTrackAdded',
  ActiveSpeakersUpdate = 'activeSpeakersUpdate',
  DataPacketReceived = 'dataPacketReceived',
  DCBufferStatusChanged = 'dcBufferStatusChanged',
}

export enum TrackEvent {
  Message = 'message',
  Muted = 'muted',
  Unmuted = 'unmuted',
  /**
   * Only fires on LocalTracks
   */
  Restarted = 'restarted',
  Ended = 'ended',
  Subscribed = 'subscribed',
  Unsubscribed = 'unsubscribed',
  /** @internal */
  UpdateSettings = 'updateSettings',
  /** @internal */
  UpdateSubscription = 'updateSubscription',
  /** @internal */
  AudioPlaybackStarted = 'audioPlaybackStarted',
  /** @internal */
  AudioPlaybackFailed = 'audioPlaybackFailed',
  /**
   * @internal
   * Only fires on LocalAudioTrack instances
   */
  AudioSilenceDetected = 'audioSilenceDetected',
  /** @internal */
  VisibilityChanged = 'visibilityChanged',
  /** @internal */
  VideoDimensionsChanged = 'videoDimensionsChanged',
  /** @internal */
  ElementAttached = 'elementAttached',
  /** @internal */
  ElementDetached = 'elementDetached',
  /**
   * @internal
   * Only fires on LocalTracks
   */
  UpstreamPaused = 'upstreamPaused',
  /**
   * @internal
   * Only fires on LocalTracks
   */
  UpstreamResumed = 'upstreamResumed',
  /**
   * @internal
   * Fires on RemoteTrackPublication
   */
  SubscriptionPermissionChanged = 'subscriptionPermissionChanged',
  /**
   * Fires on RemoteTrackPublication
   */
  SubscriptionStatusChanged = 'subscriptionStatusChanged',
  /**
   * Fires on RemoteTrackPublication
   */
  SubscriptionFailed = 'subscriptionFailed',
}
