import { TrackEvent } from '../events';
import { monitorFrequency } from '../stats';
import type { LoggerOptions } from '../types';
import { Track } from './Track';
import { supportsSynchronizationSources } from './utils';

export default abstract class RemoteTrack<
  TrackKind extends Track.Kind = Track.Kind,
> extends Track<TrackKind> {
  /** @internal */
  receiver?: RTCRtpReceiver;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    kind: TrackKind,
    receiver?: RTCRtpReceiver,
    loggerOptions?: LoggerOptions,
  ) {
    super(mediaTrack, kind, loggerOptions);

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
    this.mediaStream = stream;
    const onRemoveTrack = (event: MediaStreamTrackEvent) => {
      if (event.track === this._mediaStreamTrack) {
        stream.removeEventListener('removetrack', onRemoveTrack);
        this.receiver = undefined;
        this._currentBitrate = 0;
        this.emit(TrackEvent.Ended, this);
      }
    };
    stream.addEventListener('removetrack', onRemoveTrack);
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
  }

  /**
   * Gets the RTCStatsReport for the RemoteTrack's underlying RTCRtpReceiver
   * See https://developer.mozilla.org/en-US/docs/Web/API/RTCStatsReport
   *
   * @returns Promise<RTCStatsReport> | undefined
   */
  async getRTCStatsReport(): Promise<RTCStatsReport | undefined> {
    if (!this.receiver?.getStats) {
      return;
    }
    const statsReport = await this.receiver.getStats();
    return statsReport;
  }

  /* @internal */
  startMonitor() {
    if (!this.monitorInterval) {
      this.monitorInterval = setInterval(() => this.monitorReceiver(), monitorFrequency);
    }
    if (supportsSynchronizationSources()) {
      this.registerTimeSyncUpdate();
    }
  }

  protected abstract monitorReceiver(): void;

  registerTimeSyncUpdate() {
    const loop = () => {
      this.timeSyncHandle = requestAnimationFrame(() => loop());
      const sources = this.receiver?.getSynchronizationSources()[0];
      if (sources) {
        const { timestamp, rtpTimestamp } = sources;
        if (rtpTimestamp && this.rtpTimestamp !== rtpTimestamp) {
          this.emit(TrackEvent.TimeSyncUpdate, { timestamp, rtpTimestamp });
          this.rtpTimestamp = rtpTimestamp;
        }
      }
    };
    loop();
  }
}
