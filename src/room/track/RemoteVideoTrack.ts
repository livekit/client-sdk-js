import { TrackEvent } from '../events';
import { Track } from './Track';
import { VideoTrack } from './VideoTrack';

export class RemoteVideoTrack extends VideoTrack {
  sid: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, sid: string) {
    super(mediaTrack);
    // override id to parsed ID
    this.sid = sid;
  }

  setMuted(muted: boolean) {
    if (this.isMuted != muted) {
      this.isMuted = muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }
  }
}
