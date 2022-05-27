import { SignalClient } from '../../api/SignalClient';
import log from '../../logger';
import { VideoLayer, VideoQuality } from '../../proto/livekit_models';
import { SubscribedQuality } from '../../proto/livekit_rtc';
import { computeBitrate, monitorFrequency, VideoSenderStats } from '../stats';
import { isFireFox, isMobile, isWeb } from '../utils';
import LocalTrack from './LocalTrack';
import { VideoCaptureOptions } from './options';
import { Track } from './Track';
import { constraintsForOptions } from './utils';

export default class LocalVideoTrack extends LocalTrack {
  /* internal */
  signalClient?: SignalClient;

  private prevStats?: Map<string, VideoSenderStats>;

  private encodings?: RTCRtpEncodingParameters[];

  constructor(mediaTrack: MediaStreamTrack, constraints?: MediaTrackConstraints) {
    super(mediaTrack, Track.Kind.Video, constraints);
  }

  get isSimulcast(): boolean {
    if (this.sender && this.sender.getParameters().encodings.length > 1) {
      return true;
    }
    return false;
  }

  /* @internal */
  startMonitor(signalClient: SignalClient) {
    this.signalClient = signalClient;
    if (!isWeb()) {
      return;
    }
    // save original encodings
    const params = this.sender?.getParameters();
    if (params) {
      this.encodings = params.encodings;
    }

    setTimeout(() => {
      this.monitorSender();
    }, monitorFrequency);
  }

  stop() {
    this.sender = undefined;
    this._mediaStreamTrack.getConstraints();
    super.stop();
  }

  async mute(): Promise<LocalVideoTrack> {
    if (this.source === Track.Source.Camera) {
      log.debug('stopping camera track');
      // also stop the track, so that camera indicator is turned off
      this._mediaStreamTrack.stop();
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
          qualityLimitationResolutionChanges: v.qualityLimitationResolutionChanges,
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
    log.debug(`setting publishing quality. max quality ${maxQuality}`);
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
        log.debug(
          `setting layer ${subscribedQuality.quality} to ${
            encoding.active ? 'enabled' : 'disabled'
          }`,
        );

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

  private monitorSender = async () => {
    if (!this.sender) {
      this._currentBitrate = 0;
      return;
    }

    let stats: VideoSenderStats[] | undefined;
    try {
      stats = await this.getSenderStats();
    } catch (e) {
      log.error('could not get audio sender stats', { error: e });
      return;
    }
    const statsMap = new Map<string, VideoSenderStats>(stats.map((s) => [s.rid, s]));

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
      this.monitorSender();
    }, monitorFrequency);
  };

  protected async handleAppVisibilityChanged() {
    await super.handleAppVisibilityChanged();
    if (!isMobile()) return;
    if (this.isInBackground && this.source === Track.Source.Camera) {
      this._mediaStreamTrack.enabled = false;
    }
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
    return [
      {
        quality: VideoQuality.HIGH,
        width,
        height,
        bitrate: 0,
        ssrc: 0,
      },
    ];
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
