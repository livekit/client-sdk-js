import log from 'loglevel';
import { SignalClient } from '../../api/SignalClient';
import { VideoQuality } from '../../proto/livekit_rtc';
import { monitorFrequency, VideoSenderStats } from '../stats';
import LocalTrack from './LocalTrack';
import { CreateVideoTrackOptions } from './options';
import { Track } from './Track';

// upgrade delay for diff qualities
const QUALITY_UPGRADE_DELAY = 60 * 1000;

// avoid downgrading too quickly
const QUALITY_DOWNGRADE_DELAY = 5 * 1000;

const ridOrder = ['f', 'h', 'q'];

export default class LocalVideoTrack extends LocalTrack {
  /* internal */
  signalClient?: SignalClient;

  private prevStats?: Map<string, VideoSenderStats>;

  // last time it had a change in quality
  private lastQualityChange?: number;

  // last time we made an explicit change
  private lastExplicitQualityChange?: number;

  private encodings?: RTCRtpEncodingParameters[];

  constructor(
    mediaTrack: MediaStreamTrack,
    name?: string,
    constraints?: MediaTrackConstraints,
  ) {
    super(mediaTrack, Track.Kind.Video, name, constraints);
  }

  get isSimulcast(): boolean {
    if (this.sender && this.sender.getParameters().encodings.length > 1) {
      return true;
    }
    return false;
  }

  /* internal */
  startMonitor(signalClient: SignalClient) {
    // only monitor simulcast streams
    if (!this.isSimulcast) {
      return;
    }
    this.signalClient = signalClient;

    setTimeout(() => {
      this.monitorSender();
    }, monitorFrequency);
  }

  stop() {
    this.sender = undefined;
    this.mediaStreamTrack.getConstraints();
    super.stop();
  }

  mute(): LocalTrack {
    // also stop the track, so that camera indicator is turned off
    this.mediaStreamTrack.stop();
    return super.mute();
  }

  unmute(): LocalTrack {
    this.restartTrack();
    return super.unmute();
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
          framesSent: v.framesSent,
          timestamp: v.timestamp,
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
      const ai = ridOrder.indexOf(a.rid);
      const bi = ridOrder.indexOf(b.rid);
      if (ai === bi) {
        return 0;
      }
      return ai < bi ? -1 : 1;
    });

    return items;
  }

  setPublishingQuality(maxQuality: VideoQuality) {
    if (!this.isSimulcast || !this.encodings) {
      return;
    }

    let hasChanged = false;
    const layers: VideoQuality[] = [];
    this.encodings.forEach((encoding) => {
      const quality = videoQualityForRid(encoding.rid ?? '');
      const active = quality <= maxQuality;
      if (active !== encoding.active) {
        hasChanged = true;
        encoding.active = active;
      }
      if (active) {
        layers.push(quality);
      }
    });

    if (!hasChanged || !this.sender || !this.sid) {
      return;
    }

    this.lastQualityChange = new Date().getTime();
    this.lastExplicitQualityChange = new Date().getTime();

    this.signalClient?.sendSetSimulcastLayers(this.sid, layers);

    const params = this.sender.getParameters();
    params.encodings = this.encodings;
    log.debug('setting publishing quality. max quality', maxQuality);
    this.sender.setParameters(params);
  }

  async restartTrack(options?: CreateVideoTrackOptions) {
    let constraints: MediaTrackConstraints | undefined;
    if (options) {
      const streamConstraints = LocalTrack.constraintsForOptions({ video: options });
      if (typeof streamConstraints.video !== 'boolean') {
        constraints = streamConstraints.video;
      }
    }
    await this.restart(constraints);
  }

  private monitorSender = async () => {
    if (!this.sender) {
      return;
    }
    const stats = await this.getSenderStats();
    const statsMap = new Map<string, VideoSenderStats>(stats.map((s) => [s.rid, s]));

    if (this.prevStats && this.isSimulcast) {
      this.checkAndUpdateSimulcast(statsMap);
    }

    this.prevStats = statsMap;
    setTimeout(() => {
      this.monitorSender();
    }, monitorFrequency);
  };

  private checkAndUpdateSimulcast(statsMap: Map<string, VideoSenderStats>) {
    if (!this.sender || this.isMuted) {
      return;
    }
    const params = this.sender.getParameters();
    this.encodings = params.encodings;

    let bestEncoding: RTCRtpEncodingParameters | undefined;
    this.encodings.forEach((encoding) => {
      // skip inactive encodings
      if (bestEncoding === undefined && encoding.active) {
        bestEncoding = encoding;
      }
    });

    if (!bestEncoding) {
      return;
    }
    const rid: string = bestEncoding.rid ?? '';
    const sendStats = statsMap.get(rid);
    const lastStats = this.prevStats?.get(rid);
    if (!sendStats || !lastStats) {
      return;
    }
    const currentQuality = videoQualityForRid(rid);

    // adaptive simulcast algorithm notes (davidzhao)
    // Chrome (and other browsers) will automatically pause the highest layer
    // when it runs into bandwidth limitations. When that happens, it would not
    // be able to send any new frames between the two stats checks.
    //
    // We need to set that layer to inactive intentionally, because chrome tends
    // to flicker, meaning it will attempt to send that layer again shortly
    // afterwards, flip-flopping every few seconds. We want to avoid that.
    //
    // Note: even after bandwidth recoevers, the flip-flopping behavior continues
    // this is possibly due to SFU-side PLI generation and imperfect bandwidth estimation
    if (sendStats.qualityLimitationResolutionChanges
        - lastStats.qualityLimitationResolutionChanges > 0) {
      this.lastQualityChange = new Date().getTime();
    }

    // log.debug('frameSent', sendStats.framesSent, 'lastSent', lastStats.framesSent,
    //   'elapsed', sendStats.timestamp - lastStats.timestamp);
    if (sendStats.framesSent - lastStats.framesSent > 0) {
      // frames have been sending ok, consider upgrading quality
      if (currentQuality === VideoQuality.HIGH || !this.lastQualityChange) return;

      const nextQuality = currentQuality + 1;
      if ((new Date()).getTime() - this.lastQualityChange < QUALITY_UPGRADE_DELAY) {
        return;
      }

      log.debug('upgrading video quality to', nextQuality);
      this.setPublishingQuality(nextQuality);
      return;
    }

    if (this.lastExplicitQualityChange
      && ((new Date()).getTime() - this.lastExplicitQualityChange) < QUALITY_DOWNGRADE_DELAY) {
      return;
    }

    if (currentQuality === VideoQuality.UNRECOGNIZED) {
      return;
    }

    if (currentQuality === VideoQuality.LOW) {
      // already the lowest quality, nothing we can do
      return;
    }

    log.debug('downgrading video quality to', currentQuality - 1);
    this.setPublishingQuality(currentQuality - 1);
  }
}

function videoQualityForRid(rid: string): VideoQuality {
  switch (rid) {
    case 'f':
      return VideoQuality.HIGH;
    case 'h':
      return VideoQuality.MEDIUM;
    case 'q':
      return VideoQuality.LOW;
    default:
      return VideoQuality.UNRECOGNIZED;
  }
}
