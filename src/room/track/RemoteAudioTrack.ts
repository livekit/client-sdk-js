import { TrackEvent } from '../events';
import { AudioTrack } from './AudioTrack';
import { Track } from './Track';

export class RemoteAudioTrack extends AudioTrack {
  sid: Track.SID;
  /** @internal */
  receiver?: RTCRtpReceiver;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver: RTCRtpReceiver
  ) {
    super(mediaTrack);
    this.sid = sid;
    this.receiver = receiver;
  }

  setMuted(muted: boolean) {
    if (this.isMuted != muted) {
      this.isMuted = muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }
  }
}
