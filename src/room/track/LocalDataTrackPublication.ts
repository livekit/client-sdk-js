import { TrackInfo } from '../../proto/model';
import { LocalDataTrack } from './LocalDataTrack';
import { LocalTrackPublication } from './LocalTrackPublication';
import { Track } from './Track';

export class LocalDataTrackPublication extends LocalTrackPublication {
  track: LocalDataTrack;

  constructor(track: LocalDataTrack, ti: TrackInfo) {
    super(Track.Kind.Data, ti);
    this.track = track;
  }
}
