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
  TrackAdded = 'trackAdded',
  ParticipantUpdate = 'participantUpdate',
}

// export enum TrackEvent {
//   TrackPublished = 'trackPublished',
// }
