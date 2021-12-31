import { TrackEvent } from '../events';
import { AudioReceiverStats, computeBitrate, monitorFrequency } from '../stats';
import { Track } from './Track';

export default class RemoteAudioTrack extends Track {
  /** @internal */
  receiver?: RTCRtpReceiver;

  private _currentBitrate: number = 0;

  private prevStats?: AudioReceiverStats;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver?: RTCRtpReceiver,
  ) {
    super(mediaTrack, Track.Kind.Audio);
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
      this.monitorSender();
    }, monitorFrequency);
  }

  private monitorSender = async () => {
    if (!this.receiver) {
      this._currentBitrate = 0;
      return;
    }
    const stats = await this.getReceiverStats();

    if (stats && this.prevStats) {
      this._currentBitrate = computeBitrate(
        stats.bytesReceived, this.prevStats.bytesReceived,
        stats.timestamp, this.prevStats.timestamp,
      );
    }

    this.prevStats = stats;
    setTimeout(() => {
      this.monitorSender();
    }, monitorFrequency);
  };

  private async getReceiverStats(): Promise<AudioReceiverStats | undefined> {
    if (!this.receiver) {
      return;
    }

    const stats = await this.receiver.getStats();
    let receiverStats: AudioReceiverStats | undefined;
    stats.forEach((v) => {
      if (v.type === 'inbound-rtp') {
        receiverStats = {
          type: 'audio',
          timestamp: v.timestamp,
          jitter: v.jitter,
          bytesReceived: v.bytesReceived,
          concealedSamples: v.concealedSamples,
          concealmentEvents: v.concealmentEvents,
          silentConcealedSamples: v.silentConcealedSamples,
          silentConcealmentEvents: v.silentConcealmentEvents,
          totalAudioEnergy: v.totalAudioEnergy,
          totalSamplesDuration: v.totalSamplesDuration,
        };
      }
    });
    return receiverStats;
  }
}
