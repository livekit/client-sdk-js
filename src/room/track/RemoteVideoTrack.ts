import { TrackEvent } from '../events';
import { VideoReceiverStats } from '../stats';
import { Track } from './Track';

export default class RemoteVideoTrack extends Track {
  /** @internal */
  receiver?: RTCRtpReceiver;

  private prevStats?: VideoReceiverStats;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver?: RTCRtpReceiver,
  ) {
    super(mediaTrack, Track.Kind.Video);
    // override id to parsed ID
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

  stop() {
    super.stop();
  }
}
