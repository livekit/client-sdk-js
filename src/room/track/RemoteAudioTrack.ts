import { TrackEvent } from '../events';
import { AudioTrack } from './AudioTrack';

export class RemoteAudioTrack extends AudioTrack {
  /** @internal */
  receiver?: RTCRtpReceiver;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver?: RTCRtpReceiver
  ) {
    super(mediaTrack);
    this.sid = sid;
    this.receiver = receiver;
  }

  /** @internal */
  setMuted(muted: boolean) {
    if (this.isMuted != muted) {
      this.isMuted = muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }
  }
}
