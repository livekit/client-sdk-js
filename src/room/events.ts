export enum RoomEvent {
  Disconnected = 'disconnected',
  ParticipantConnected = 'participantConnected',
  ParticipantDisconnected = 'participantDisconnected',
  TrackPublished = 'trackPublished',
  TrackSubscribed = 'trackSubscribed',
  TrackUnpublished = 'trackUnpublished',
  TrackUnsubscribed = 'trackUnsubscribed',
  TrackMessage = 'trackMessage',
}

export enum ParticipantEvent {
  TrackPublished = 'trackPublished',
  TrackSubscribed = 'trackSubscribed',
  TrackUnpublished = 'trackUnpublished',
  TrackUnsubscribed = 'trackUnsubscribed',
  TrackMessage = 'trackMessage',
}

export enum EngineEvent {
  Connected = 'connected',
  Disconnected = 'disconnected',
  LocalTrackPublished = 'localTrackPublished',
  ParticipantUpdate = 'participantUpdate',
  MediaTrackAdded = 'mediaTrackAdded',
  DataChannelAdded = 'dataChannelAdded',
}

export enum TrackEvent {
  Message = 'message',
}
