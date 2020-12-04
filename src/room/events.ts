export enum RoomEvent {
  Disconnected = 'disconnected',
  ParticipantConnected = 'participantConnected',
  TrackPublished = 'trackPublished',
  TrackSubscribed = 'trackSubscribed',
}

export enum ParticipantEvent {
  TrackPublished = 'trackPublished',
  TrackSubscribed = 'trackSubscribed',
}

export enum EngineEvent {
  Connected = 'connected',
  Disconnected = 'disconnected',
  TrackAdded = 'trackAdded',
}
