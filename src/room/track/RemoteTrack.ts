import { TrackEvent } from '../events';
import { monitorFrequency } from '../stats';
import { Track } from './Track';
import { isWeb } from '../utils';

export default abstract class RemoteTrack extends Track {
  /** @internal */
  receiver?: RTCRtpReceiver;

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

  /** @internal */
  setMuted(muted: boolean) {
    if (this.isMuted !== muted) {
      this.isMuted = muted;
      this._mediaStreamTrack.enabled = !muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }
  }

  /** @internal */
  setMediaStream(stream: MediaStream) {
    // this is needed to determine when the track is finished
    // we send each track down in its own MediaStream, so we can assume the
    // current track is the only one that can be removed.
    this.mediaStream = stream;
    stream.onremovetrack = () => {
      this.receiver = undefined;
      this._currentBitrate = 0;
      this.emit(TrackEvent.Ended, this);
      // CosmosVideo hack for removing leack listeners
      this.stop();
    };
  }

  start() {
    this.startMonitor();
    // use `enabled` of track to enable re-use of transceiver
    super.enable();
  }

  stop() {
    this.stopMonitor();
    // use `enabled` of track to enable re-use of transceiver
    super.disable();
    // CosmosVideo hack for removing leack listeners
    if (isWeb()) {
      document.removeEventListener('visibilitychange', this.appVisibilityChangedListener);
    }
  }

  /* @internal */
  startMonitor() {
    if (!this.monitorInterval) {
      this.monitorInterval = setInterval(() => this.monitorReceiver(), monitorFrequency);
    }
  }

  protected abstract monitorReceiver(): void;
}
