import { TrackEvent } from '../events';
import { AudioTrack } from './AudioTrack';
import { Track } from './Track';

export class RemoteAudioTrack extends AudioTrack {
  sid: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, sid: string) {
    super(mediaTrack);
    this.sid = sid;
  }

  setMuted(muted: boolean) {
    if (this.isMuted != muted) {
      this.isMuted = muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }
  }
}
