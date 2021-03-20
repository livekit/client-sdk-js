import { TrackInfo } from '../../proto/livekit_models';
import { RemoteTrackPublication } from './RemoteTrackPublication';
import { RemoteVideoTrack } from './RemoteVideoTrack';
import { Track } from './Track';

export class RemoteVideoTrackPublication extends RemoteTrackPublication {
  track?: RemoteVideoTrack;

  constructor(info: TrackInfo, track?: RemoteVideoTrack) {
    super(Track.Kind.Video, info.sid, info.name);
    this.track = track;
  }
}
