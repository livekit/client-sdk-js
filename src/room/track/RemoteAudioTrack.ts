import { TrackEvent } from '../events';
import { Track } from './Track';

export default class RemoteAudioTrack extends Track {
  /** @internal */
  receiver?: RTCRtpReceiver;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver?: RTCRtpReceiver,
  ) {
    super(mediaTrack, Track.Kind.Audio);
    this.sid = sid;
    this.receiver = receiver;
  }

  /** @internal */
  setMuted(muted: boolean) {
    if (this.isMuted !== muted) {
      this.isMuted = muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }
  }
}
