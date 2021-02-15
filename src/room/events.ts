export enum RoomEvent {
  Disconnected = 'disconnected',
  ParticipantConnected = 'participantConnected',
  ParticipantDisconnected = 'participantDisconnected',
  TrackPublished = 'trackPublished',
  TrackSubscribed = 'trackSubscribed',
  TrackSubscriptionFailed = 'trackSubscriptionFailed',
  TrackUnpublished = 'trackUnpublished',
  TrackUnsubscribed = 'trackUnsubscribed',
  TrackMuted = 'trackMuted',
  TrackUnmuted = 'trackUnmuted',
  TrackMessage = 'trackMessage',
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
