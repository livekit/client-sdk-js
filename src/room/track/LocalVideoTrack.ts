import log from 'loglevel';
import { monitorFrequency, VideoSenderStats } from '../stats';
import LocalTrack from './LocalTrack';
import { Track } from './Track';

const ridOrder = ['f', 'h', 'q'];

export default class LocalVideoTrack extends LocalTrack {
  private prevStats?: VideoSenderStats[];

  constructor(
    mediaTrack: MediaStreamTrack,
    name?: string,
    constraints?: MediaTrackConstraints,
  ) {
    super(mediaTrack, Track.Kind.Video, name);
    this.constraints = constraints || {};
  }

  startMonitor() {
    setTimeout(() => {
      this.monitorSender();
    }, monitorFrequency);
  }

  stop() {
    this.sender = undefined;
    super.stop();
  }

  async getSenderStats(): Promise<VideoSenderStats[]> {
    if (!this.sender) {
      return [];
    }

    const items: VideoSenderStats[] = [];

    const stats = await this.sender.getStats();
    let sender: any;
    stats.forEach((v) => {
      if (
        v.type === 'track'
        && v.trackIdentifier === this.mediaStreamTrack.id
      ) {
        sender = v;
      }
    });

    if (!sender) {
      return items;
    }

    // match the outbound-rtp items
    stats.forEach((v) => {
      if (v.type === 'outbound-rtp' && v.trackId === sender.id) {
        const vs: VideoSenderStats = {
          type: 'video',
          streamId: v.id,
          frameHeight: v.frameHeight,
          frameWidth: v.frameWidth,
          firCount: v.firCount,
          pliCount: v.pliCount,
          nackCount: v.nackCount,
          packetsSent: v.packetsSent,
          rid: v.rid,
          retransmittedPacketsSent: v.retransmittedPacketsSent,
          qualityLimitationReason: v.qualityLimitationReason,
          qualityLimitationResolutionChanges:
            v.qualityLimitationResolutionChanges,
        };

        // locate the appropriate remote-inbound-rtp item
        const r = stats.get(v.remoteId);
        if (r) {
          vs.jitter = r.jitter;
          vs.packetsLost = r.packetsLost;
          vs.roundTripTime = r.roundTripTime;
        }

        items.push(vs);
      }
    });

    // sort by rid, so that f, h, q is the ordering
    items.sort((a, b): number => {
      const ai = ridOrder.indexOf(a.rid!);
      const bi = ridOrder.indexOf(b.rid!);
      if (ai === bi) {
        return 0;
      }
      return ai < bi ? -1 : 1;
    });

    return items;
  }

  private monitorSender = async () => {
    if (!this.sender) {
      return;
    }
    const stats = await this.getSenderStats();

    if (this.prevStats) {
      if (this.prevStats.length !== stats.length) {
        // can't compare if length different
        log.warn('number of tracks changed', stats);
        return;
      }

      for (let i = 0; i < this.prevStats.length; i += 1) {
        this.handleStats(this.prevStats[i], stats[i]);
      }
    }

    // compare and findout
    this.prevStats = stats;
    setTimeout(() => {
      this.monitorSender();
    }, monitorFrequency);
  };

  private handleStats(prev: VideoSenderStats, curr: VideoSenderStats) {
    const pliDelta = curr.pliCount - prev.pliCount;
    const nackDelta = curr.nackCount - prev.nackCount;
    const qualityLimited = curr.qualityLimitationReason && curr.qualityLimitationReason !== 'none';
    if (pliDelta > 0 || qualityLimited) {
      log.debug(
        'detected publisher quality issue',
        'track',
        this.id,
        'rid',
        curr.rid,
        'pliDelta',
        pliDelta,
        'nackDelta',
        nackDelta,
        'qualityLimited',
        curr.qualityLimitationReason,
        curr,
      );
    }
  }
}
