import { TrackInfo } from '../../proto/model';
import { LocalTrackPublication } from './LocalTrackPublication';
import { LocalVideoTrack } from './LocalVideoTrack';
import { Track } from './Track';

export class LocalVideoTrackPublication extends LocalTrackPublication {
  readonly track: LocalVideoTrack;

  constructor(track: LocalVideoTrack, ti: TrackInfo) {
    super(Track.Kind.Video, ti);
    this.track = track;
  }
}
