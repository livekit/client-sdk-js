import log from 'loglevel';
import { TrackEvent } from '../events';
import { monitorFrequency, VideoReceiverStats } from '../stats';
import { Track } from './Track';
import { VideoTrack } from './VideoTrack';

export class RemoteVideoTrack extends VideoTrack {
  sid: Track.SID;
  /** @internal */
  receiver?: RTCRtpReceiver;
  private prevStats?: VideoReceiverStats;

  constructor(
    mediaTrack: MediaStreamTrack,
    sid: string,
    receiver: RTCRtpReceiver
  ) {
    super(mediaTrack);
    // override id to parsed ID
    this.sid = sid;
    this.receiver = receiver;
  }

  setMuted(muted: boolean) {
    if (this.isMuted != muted) {
      this.isMuted = muted;
      this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
    }
  }

  startMonitor() {
    setTimeout(this.monitorReceiver, monitorFrequency);
  }

  stop() {
    super.stop();
  }

  async getReceiverStats(): Promise<VideoReceiverStats | null> {
    if (!this.mediaStreamTrack || !this.receiver) return null;

    const stats = await this.receiver.getStats();
    let rs: any;
    for (const [key, v] of stats) {
      if (
        v.type === 'track' &&
        v.trackIdentifier === this.mediaStreamTrack.id
      ) {
        rs = v;
        break;
      }
    }

    if (!rs) {
      return null;
    }

    // match the outbound-rtp items
    for (const [key, v] of stats) {
      if (v.type === 'inbound-rtp' && v.trackId === rs.id) {
        return {
          type: 'video',
          jitterBufferDelay: rs.jitterBufferDelay,
          packetsLost: v.packetsLost,
          packetsReceived: v.packetsReceived,
          streamId: v.id,
          framesDecoded: v.framesDecoded,
          framesDropped: v.framesDropped,
          framesReceived: v.framesReceived,
          frameWidth: v.frameWidth,
          frameHeight: v.frameHeight,
          firCount: v.firCount,
          pliCount: v.pliCount,
          nackCount: v.nackCount,
        };
      }
    }

    return null;
  }

  private monitorReceiver = async () => {
    if (!this.receiver) {
      return;
    }

    const stats = await this.getReceiverStats();
    if (!stats) {
      return;
    }

    if (this.prevStats) {
      this.handleStats(this.prevStats, stats);
    }

    // compare and findout
    this.prevStats = stats;
    setTimeout(this.monitorReceiver, monitorFrequency);
  };

  private handleStats(prev: VideoReceiverStats, curr: VideoReceiverStats) {
    const pliDelta = curr.pliCount - prev.pliCount;
    const nackDelta = curr.nackCount - prev.nackCount;
    const droppedDelta = curr.framesDropped - prev.framesDropped;

    if (pliDelta > 0 || nackDelta > 0 || droppedDelta > 0) {
      log.debug(
        'detected subscriber quality issue',
        'track',
        this.sid,
        'pliDelta',
        pliDelta,
        'nackDelta',
        nackDelta,
        'droppedDelta',
        droppedDelta,
        curr
      );
    }
  }
}
