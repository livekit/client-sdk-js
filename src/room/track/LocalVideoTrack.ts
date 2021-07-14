import log from 'loglevel';
import { SignalClient } from '../../api/SignalClient';
import { VideoQuality } from '../../proto/livekit_rtc';
import { monitorFrequency, VideoSenderStats } from '../stats';
import LocalTrack from './LocalTrack';
import { Track } from './Track';

// number of downgrades to turn off highest quality layer
const DOWNGRADES_TO_STEP_DOWN = 2;

// number of successes to turn on next higher layer
const SUCCESSES_TO_STEP_UP = 4;

// once it's disabled this number of times, it will be turned off for the rest
// of the session
const MAX_QUALITY_ATTEMPTS = 3;

const ridOrder = ['f', 'h', 'q'];

export default class LocalVideoTrack extends LocalTrack {
  /* internal */
  signalClient?: SignalClient;

  private prevStats?: VideoSenderStats[];

  // simulcast controls
  // consecutive downgrades, reset when we have a success
  private numDowngrades = 0;

  // consecutive successes, reset when we have a downgrade
  private numSuccesses = 0;

  // keep track of times we had to disable a track
  private disableCount: { [number: string]: number } = {
    2: 0,
    1: 0,
    0: 0,
  };

  private encodings?: RTCRtpEncodingParameters[];

  constructor(
    mediaTrack: MediaStreamTrack,
    name?: string,
    constraints?: MediaTrackConstraints,
  ) {
    super(mediaTrack, Track.Kind.Video, name);
    this.constraints = constraints || {};
  }

  get isSimulcast(): boolean {
    if (this.sender?.getParameters().encodings.length === 3) {
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
    this.encodings.forEach((encoding) => {
      const quality = videoQualityForRid(encoding.rid ?? '');
      const active = quality <= maxQuality;
      if (active !== encoding.active) {
        hasChanged = true;
        encoding.active = active;
      }
    });

    if (!hasChanged || !this.sender || !this.sid) {
      return;
    }

    const params = this.sender.getParameters();
    params.encodings = this.encodings;
    log.debug('setting publishing quality. max quality', maxQuality, 'encodings', params.encodings);
    this.sender.setParameters(params);

    const layers: VideoQuality[] = [];
    for (let q = VideoQuality.LOW; q <= maxQuality; q += 1) {
      layers.push(q);
    }
    this.signalClient?.sendSetSimulcastLayers(this.sid, layers);
  }

  private monitorSender = async () => {
    if (!this.sender) {
      return;
    }
    const stats = await this.getSenderStats();
    const statsMap = new Map<string, VideoSenderStats>(stats.map((s) => [s.rid, s]));

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
    if (!sendStats) {
      return;
    }

    const isLimited = sendStats.qualityLimitationReason === 'bandwidth' || sendStats.qualityLimitationReason === 'cpu';
    if (isLimited) {
      this.numDowngrades += 1;
      this.numSuccesses = 0;
    } else {
      this.numSuccesses += 1;
      this.numDowngrades = 0;
    }

    const currentQuality = videoQualityForRid(rid);
    if (currentQuality === VideoQuality.UNRECOGNIZED) {
      return;
    }

    let nextQuality: VideoQuality = currentQuality;
    if (this.numDowngrades > DOWNGRADES_TO_STEP_DOWN && currentQuality > VideoQuality.LOW) {
      this.disableCount[currentQuality] += 1;
      nextQuality = currentQuality - 1;
    } else if (this.numSuccesses > SUCCESSES_TO_STEP_UP && currentQuality < VideoQuality.HIGH) {
      if (this.disableCount[currentQuality + 1] <= MAX_QUALITY_ATTEMPTS) {
        nextQuality = currentQuality + 1;
      }
    }

    if (nextQuality !== currentQuality) {
      this.numDowngrades = 0;
      this.numSuccesses = 0;
      this.setPublishingQuality(nextQuality);
    }

    // this.prevStats = stats;
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
