export enum RoomEvent {
  Disconnected = 'disconnected',
  ParticipantConnected = 'participantConnected',
  ParticipantDisconnected = 'participantDisconnected',
  TrackPublished = 'trackPublished',
  TrackSubscribed = 'trackSubscribed',
  TrackUnpublished = 'trackUnpublished',
  TrackUnsubscribed = 'trackUnsubscribed',
}

export enum ParticipantEvent {
  TrackPublished = 'trackPublished',
  TrackSubscribed = 'trackSubscribed',
  TrackUnpublished = 'trackUnpublished',
  TrackUnsubscribed = 'trackUnsubscribed',
}

export enum EngineEvent {
  Connected = 'connected',
  Disconnected = 'disconnected',
  LocalTrackPublished = 'localTrackPublished',
  ParticipantUpdate = 'participantUpdate',
  TrackAdded = 'trackAdded',
}

// export enum TrackEvent {
//   TrackPublished = 'trackPublished',
// }
