import { Track } from './Track';
import { TrackPublication } from './TrackPublication';
import { RemoteTrack } from './types';

export class RemoteTrackPublication extends TrackPublication {
  track?: RemoteTrack;

  constructor(kind: Track.Kind, id: string, name: string) {
    super(kind, id, name);
  }

  get isSubscribed(): boolean {
    return !!this.track;
  }
}
