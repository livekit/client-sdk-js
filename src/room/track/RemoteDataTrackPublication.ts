import { TrackInfo } from '../../proto/model';
import { RemoteDataTrack } from './RemoteDataTrack';
import { RemoteTrackPublication } from './RemoteTrackPublication';
import { Track } from './Track';

export class RemoteDataTrackPublication extends RemoteTrackPublication {
  track?: RemoteDataTrack;

  constructor(info: TrackInfo, track?: RemoteDataTrack) {
    super(Track.Kind.Data, info.sid, info.name);
    this.track = track;
  }
}
