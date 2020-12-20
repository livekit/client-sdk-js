import { TrackInfo } from '../../proto/model';
import { RemoteAudioTrack } from './RemoteAudioTrack';
import { RemoteTrackPublication } from './RemoteTrackPublication';
import { Track } from './Track';

export class RemoteAudioTrackPublication extends RemoteTrackPublication {
  track?: RemoteAudioTrack;

  constructor(info: TrackInfo, track?: RemoteAudioTrack) {
    super(Track.Kind.Audio, info.sid, info.name);
    this.track = track;
  }
}
