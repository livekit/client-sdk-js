import { TrackEvent } from '../events';
import { monitorFrequency } from '../stats';
import { Track } from './Track';

export default abstract class RemoteTrack extends Track {
  /** @internal */
  receiver?: RTCRtpReceiver;

  protected _currentBitrate: number = 0;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    kind: Track.Kind,
    receiver?: RTCRtpReceiver,
  ) {
    super(mediaTrack, kind);
    this.sid = sid;
    this.receiver = receiver;
  }

  /** current receive bits per second */
  get currentBitrate(): number {
    return this._currentBitrate;
  }

  /** @internal */
  setMuted(muted: boolean) {
    if (this.isMuted !== muted) {
      this.isMuted = muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }
  }

  /** @internal */
  setMediaStream(stream: MediaStream) {
    // this is needed to determine when the track is finished
    // we send streams down independently, so we can assume the track is finished
    // when the stream is.
    stream.onremovetrack = () => {
      this.emit(TrackEvent.Ended, this);
    };
  }

  start() {
    // use `enabled` of track to enable re-use of transceiver
    super.enable();
  }

  stop() {
    // use `enabled` of track to enable re-use of transceiver
    super.disable();
  }

  /* @internal */
  startMonitor() {
    setTimeout(() => {
      this.monitorReceiver();
    }, monitorFrequency);
  }

  protected abstract monitorReceiver(): void;
}
