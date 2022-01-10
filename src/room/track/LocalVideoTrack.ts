import { SignalClient } from '../../api/SignalClient';
import log from '../../logger';
import { VideoLayer, VideoQuality } from '../../proto/livekit_models';
import { SubscribedQuality } from '../../proto/livekit_rtc';
import { computeBitrate, monitorFrequency, VideoSenderStats } from '../stats';
import { isFireFox } from '../utils';
import LocalTrack from './LocalTrack';
import { VideoCaptureOptions } from './options';
import { Track } from './Track';
import { constraintsForOptions } from './utils';

// delay before attempting to upgrade
const QUALITY_UPGRADE_DELAY = 60 * 1000;

// avoid downgrading too quickly
const QUALITY_DOWNGRADE_DELAY = 5 * 1000;

const ridOrder = ['q', 'h', 'f'];

export default class LocalVideoTrack extends LocalTrack {
  /* internal */
  signalClient?: SignalClient;

  private prevStats?: Map<string, VideoSenderStats>;

  // last time it had a change in quality
  private lastQualityChange?: number;

  // last time we made an explicit change
  private lastExplicitQualityChange?: number;

  private encodings?: RTCRtpEncodingParameters[];

  // layers that are being subscribed to, and that we should publish
  private activeQualities?: SubscribedQuality[];

  constructor(
    mediaTrack: MediaStreamTrack,
    constraints?: MediaTrackConstraints,
  ) {
    super(mediaTrack, Track.Kind.Video, constraints);
  }

  get isSimulcast(): boolean {
    if (this.sender && this.sender.getParameters().encodings.length > 1) {
      return true;
    }
    return false;
  }

  /* @internal */
  startMonitor(signalClient: SignalClient, disableLayerPause: boolean) {
    this.signalClient = signalClient;
    // save original encodings
    const params = this.sender?.getParameters();
    if (params) {
      this.encodings = params.encodings;
    }

    setTimeout(() => {
      this.monitorSender(disableLayerPause);
    }, monitorFrequency);
  }

  stop() {
    this.sender = undefined;
    this.mediaStreamTrack.getConstraints();
    super.stop();
  }

  async mute(): Promise<LocalVideoTrack> {
    if (this.source === Track.Source.Camera) {
      log.debug('stopping camera track');
      // also stop the track, so that camera indicator is turned off
      this.mediaStreamTrack.stop();
    }
    await super.mute();
    return this;
  }

  async unmute(): Promise<LocalVideoTrack> {
    if (this.source === Track.Source.Camera) {
      log.debug('reacquiring camera track');
      await this.restartTrack();
    }
    await super.unmute();
    return this;
  }

  async getSenderStats(): Promise<VideoSenderStats[]> {
    if (!this.sender) {
      return [];
    }

    const items: VideoSenderStats[] = [];

    const stats = await this.sender.getStats();
    stats.forEach((v) => {
      if (v.type === 'outbound-rtp') {
        const vs: VideoSenderStats = {
          type: 'video',
          streamId: v.id,
          frameHeight: v.frameHeight,
          frameWidth: v.frameWidth,
          firCount: v.firCount,
          pliCount: v.pliCount,
          nackCount: v.nackCount,
          packetsSent: v.packetsSent,
          bytesSent: v.bytesSent,
          framesSent: v.framesSent,
          timestamp: v.timestamp,
          rid: v.rid ?? '',
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

    return items;
  }

  setPublishingQuality(maxQuality: VideoQuality) {
    const qualities: SubscribedQuality[] = [];
    for (let q = VideoQuality.LOW; q <= VideoQuality.HIGH; q += 1) {
      qualities.push({
        quality: q,
        enabled: q <= maxQuality,
      });
    }
    log.debug('setting publishing quality. max quality', maxQuality);
    this.setPublishingLayers(qualities);
  }

  async setDeviceId(deviceId: string) {
    if (this.constraints.deviceId === deviceId) {
      return;
    }
    this.constraints.deviceId = deviceId;
    // when video is muted, underlying media stream track is stopped and
    // will be restarted later
    if (!this.isMuted) {
      await this.restartTrack();
    }
  }

  async restartTrack(options?: VideoCaptureOptions) {
    let constraints: MediaTrackConstraints | undefined;
    if (options) {
      const streamConstraints = constraintsForOptions({ video: options });
      if (typeof streamConstraints.video !== 'boolean') {
        constraints = streamConstraints.video;
      }
    }
    await this.restart(constraints);
  }

  /**
   * @internal
   * Sets layers that should be publishing
   */
  async setPublishingLayers(qualities: SubscribedQuality[]) {
    log.debug('setting publishing layers', qualities);
    if (!this.sender || !this.encodings) {
      return;
    }
    const params = this.sender.getParameters();
    const { encodings } = params;
    if (!encodings) {
      return;
    }

    if (encodings.length !== this.encodings.length) {
      log.warn('cannot set publishing layers, encodings mismatch');
      return;
    }

    this.activeQualities = qualities;
    let hasChanged = false;
    encodings.forEach((encoding, idx) => {
      let rid = encoding.rid ?? '';
      if (rid === '') {
        rid = 'q';
      }
      const quality = videoQualityForRid(rid);
      const subscribedQuality = qualities.find((q) => q.quality === quality);
      if (!subscribedQuality) {
        return;
      }
      if (encoding.active !== subscribedQuality.enabled) {
        hasChanged = true;
        encoding.active = subscribedQuality.enabled;
        log.debug(`setting layer ${subscribedQuality.quality} to ${encoding.active ? 'enabled' : 'disabled'}`);

        // FireFox does not support setting encoding.active to false, so we
        // have a workaround of lowering its bitrate and resolution to the min.
        if (isFireFox()) {
          if (subscribedQuality.enabled) {
            encoding.scaleResolutionDownBy = this.encodings![idx].scaleResolutionDownBy;
            encoding.maxBitrate = this.encodings![idx].maxBitrate;
            /* @ts-ignore */
            encoding.maxFrameRate = this.encodings![idx].maxFrameRate;
          } else {
            encoding.scaleResolutionDownBy = 4;
            encoding.maxBitrate = 10;
            /* @ts-ignore */
            encoding.maxFrameRate = 2;
          }
        }
      }
    });

    if (hasChanged) {
      params.encodings = encodings;
      await this.sender.setParameters(params);
    }
  }

  private monitorSender = async (disableLayerPause: boolean) => {
    if (!this.sender) {
      this._currentBitrate = 0;
      return;
    }
    const stats = await this.getSenderStats();
    const statsMap = new Map<string, VideoSenderStats>(stats.map((s) => [s.rid, s]));

    if (!disableLayerPause && this.prevStats && this.isSimulcast) {
      this.checkAndUpdateSimulcast(statsMap);
    }

    if (this.prevStats) {
      let totalBitrate = 0;
      statsMap.forEach((s, key) => {
        const prev = this.prevStats?.get(key);
        totalBitrate += computeBitrate(s, prev);
      });
      this._currentBitrate = totalBitrate;
    }

    this.prevStats = statsMap;
    setTimeout(() => {
      this.monitorSender(disableLayerPause);
    }, monitorFrequency);
  };

  private checkAndUpdateSimulcast(statsMap: Map<string, VideoSenderStats>) {
    if (!this.sender || this.isMuted || !this.encodings) {
      return;
    }

    let bestEncoding: RTCRtpEncodingParameters | undefined;
    const { encodings } = this.sender.getParameters();
    encodings.forEach((encoding) => {
      // skip inactive encodings
      if (!encoding.active) return;

      if (bestEncoding === undefined) {
        bestEncoding = encoding;
      } else if (
        bestEncoding.rid
        && encoding.rid
        && ridOrder.indexOf(bestEncoding.rid) < ridOrder.indexOf(encoding.rid)
      ) {
        bestEncoding = encoding;
      } else if (
        bestEncoding.maxBitrate !== undefined
        && encoding.maxBitrate !== undefined
        && bestEncoding.maxBitrate < encoding.maxBitrate
      ) {
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
    // Note: even after bandwidth recovers, the flip-flopping behavior continues
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

      if (this.activeQualities
        && this.activeQualities.some((q) => q.quality === nextQuality && !q.enabled)
      ) {
        // quality has been disabled by the server, so we should skip
        return;
      }

      // we are already at the highest layer
      let bestQuality = VideoQuality.LOW;
      encodings.forEach((encoding) => {
        const quality = videoQualityForRid(encoding.rid ?? '');
        if (quality > bestQuality) {
          bestQuality = quality;
        }
      });
      if (nextQuality > bestQuality) {
        return;
      }

      log.debug('upgrading video quality to', nextQuality);
      this.setPublishingQuality(nextQuality);
      return;
    }

    // if best layer has not sent anything, do not downgrade till the
    // best layer starts sending something. It is possible that the
    // browser has not started some layer(s) due to cpu/bandwidth
    // constraints
    if (sendStats.framesSent === 0) return;

    // if we've upgraded or downgraded recently, give it a bit of time before
    // downgrading again
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

export function videoQualityForRid(rid: string): VideoQuality {
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

export function videoLayersFromEncodings(
  width: number,
  height: number,
  encodings?: RTCRtpEncodingParameters[],
): VideoLayer[] {
  // default to a single layer, HQ
  if (!encodings) {
    return [{
      quality: VideoQuality.HIGH,
      width,
      height,
      bitrate: 0,
      ssrc: 0,
    }];
  }
  return encodings.map((encoding) => {
    const scale = encoding.scaleResolutionDownBy ?? 1;
    let quality = videoQualityForRid(encoding.rid ?? '');
    if (quality === VideoQuality.UNRECOGNIZED && encodings.length === 1) {
      quality = VideoQuality.HIGH;
    }
    return {
      quality,
      width: width / scale,
      height: height / scale,
      bitrate: encoding.maxBitrate ?? 0,
      ssrc: 0,
    };
  });
}
