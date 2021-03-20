import { TrackInfo } from '../../proto/livekit_models';
import { Track } from './Track';
import { TrackPublication } from './TrackPublication';
import { LocalTrack } from './types';

export abstract class LocalTrackPublication extends TrackPublication {
  priority?: Track.Priority;
  track!: LocalTrack;

  constructor(kind: Track.Kind, ti: TrackInfo) {
    super(kind, ti.sid, ti.name);
  }
}
