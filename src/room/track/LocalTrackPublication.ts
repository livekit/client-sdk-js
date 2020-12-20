import { TrackInfo } from '../../proto/model';
import { Track } from './Track';
import { TrackPublication } from './TrackPublication';

export class LocalTrackPublication extends TrackPublication {
  priority?: Track.Priority;

  constructor(kind: Track.Kind, ti: TrackInfo) {
    super(kind, ti.sid, ti.name);
  }

  get isTrackEnabled(): boolean {
    return true;
  }
}
