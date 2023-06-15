import type { SignalClient } from '../../api/SignalClient';
import log from '../../logger';
import { VideoLayer, VideoQuality } from '../../proto/livekit_models';
import type { SubscribedCodec, SubscribedQuality } from '../../proto/livekit_rtc';
import { ScalabilityMode } from '../participant/publishUtils';
import { computeBitrate, monitorFrequency } from '../stats';
import type { VideoSenderStats } from '../stats';
import { Mutex, isFireFox, isMobile, isWeb, unwrapConstraint } from '../utils';
import LocalTrack from './LocalTrack';
import { Track } from './Track';
import type { VideoCaptureOptions, VideoCodec } from './options';
import { constraintsForOptions } from './utils';

export class SimulcastTrackInfo {
  codec: VideoCodec;

  mediaStreamTrack: MediaStreamTrack;

  sender?: RTCRtpSender;

  encodings?: RTCRtpEncodingParameters[];

  constructor(codec: VideoCodec, mediaStreamTrack: MediaStreamTrack) {
    this.codec = codec;
    this.mediaStreamTrack = mediaStreamTrack;
  }
}

const refreshSubscribedCodecAfterNewCodec = 5000;

export default class LocalVideoTrack extends LocalTrack {
  /* @internal */
  signalClient?: SignalClient;

  private prevStats?: Map<string, VideoSenderStats>;

  private encodings?: RTCRtpEncodingParameters[];

  /* @internal */
  simulcastCodecs: Map<VideoCodec, SimulcastTrackInfo> = new Map<VideoCodec, SimulcastTrackInfo>();

  private subscribedCodecs?: SubscribedCodec[];

  // prevents concurrent manipulations to track sender
  // if multiple get/setParameter are called concurrently, certain timing of events
  // could lead to the browser throwing an exception in `setParameter`, due to
  // a missing `getParameter` call.
  private senderLock: Mutex;

  /**
   *
   * @param mediaTrack
   * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
   * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
   */
  constructor(
    mediaTrack: MediaStreamTrack,
    constraints?: MediaTrackConstraints,
    userProvidedTrack = true,
  ) {
    super(mediaTrack, Track.Kind.Video, constraints, userProvidedTrack);
    this.senderLock = new Mutex();
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
    // TODO : merge simulcast tracks stats
    const params = this.sender?.getParameters();
    if (params) {
      this.encodings = params.encodings;
    }

    if (this.monitorInterval) {
      return;
    }
    this.monitorInterval = setInterval(() => {
      this.monitorSender();
    }, monitorFrequency);
  }

  stop() {
    this._mediaStreamTrack.getConstraints();
    this.simulcastCodecs.forEach((trackInfo) => {
      trackInfo.mediaStreamTrack.stop();
    });
    super.stop();
  }

  async mute(): Promise<LocalVideoTrack> {
    const unlock = await this.muteLock.lock();
    try {
      if (this.source === Track.Source.Camera && !this.isUserProvided) {
        log.debug('stopping camera track');
        // also stop the track, so that camera indicator is turned off
        this._mediaStreamTrack.stop();
      }
      await super.mute();
      return this;
    } finally {
      unlock();
    }
  }

  async unmute(): Promise<LocalVideoTrack> {
    const unlock = await this.muteLock.lock();
    try {
      if (this.source === Track.Source.Camera && !this.isUserProvided) {
        log.debug('reacquiring camera track');
        await this.restartTrack();
      }
      await super.unmute();
      return this;
    } finally {
      unlock();
    }
  }

  async getSenderStats(): Promise<VideoSenderStats[]> {
    if (!this.sender?.getStats) {
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
          rid: v.rid ?? v.id,
          retransmittedPacketsSent: v.retransmittedPacketsSent,
          qualityLimitationReason: v.qualityLimitationReason,
          qualityLimitationResolutionChanges: v.qualityLimitationResolutionChanges,
        };

        // locate the appropriate remote-inbound-rtp item
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

  async setDeviceId(deviceId: ConstrainDOMString): Promise<boolean> {
    if (
      this.constraints.deviceId === deviceId &&
      this._mediaStreamTrack.getSettings().deviceId === unwrapConstraint(deviceId)
    ) {
      return true;
    }
    this.constraints.deviceId = deviceId;
    // when video is muted, underlying media stream track is stopped and
    // will be restarted later
    if (!this.isMuted) {
      await this.restartTrack();
    }
    return unwrapConstraint(deviceId) === this._mediaStreamTrack.getSettings().deviceId;
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

  addSimulcastTrack(codec: VideoCodec, encodings?: RTCRtpEncodingParameters[]): SimulcastTrackInfo {
    if (this.simulcastCodecs.has(codec)) {
      throw new Error(`${codec} already added`);
    }
    const simulcastCodecInfo: SimulcastTrackInfo = {
      codec,
      mediaStreamTrack: this.mediaStreamTrack.clone(),
      sender: undefined,
      encodings,
    };
    this.simulcastCodecs.set(codec, simulcastCodecInfo);
    return simulcastCodecInfo;
  }

  setSimulcastTrackSender(codec: VideoCodec, sender: RTCRtpSender) {
    const simulcastCodecInfo = this.simulcastCodecs.get(codec);
    if (!simulcastCodecInfo) {
      return;
    }
    simulcastCodecInfo.sender = sender;

    // browser will reenable disabled codec/layers after new codec has been published,
    // so refresh subscribedCodecs after publish a new codec
    setTimeout(() => {
      if (this.subscribedCodecs) {
        this.setPublishingCodecs(this.subscribedCodecs);
      }
    }, refreshSubscribedCodecAfterNewCodec);
  }

  /**
   * @internal
   * Sets codecs that should be publishing
   */
  async setPublishingCodecs(codecs: SubscribedCodec[]): Promise<VideoCodec[]> {
    log.debug('setting publishing codecs', {
      codecs,
      currentCodec: this.codec,
    });
    // only enable simulcast codec for preference codec setted
    if (!this.codec && codecs.length > 0) {
      await this.setPublishingLayers(codecs[0].qualities);
      return [];
    }

    this.subscribedCodecs = codecs;

    const newCodecs: VideoCodec[] = [];
    for await (const codec of codecs) {
      if (!this.codec || this.codec === codec.codec) {
        await this.setPublishingLayers(codec.qualities);
      } else {
        const simulcastCodecInfo = this.simulcastCodecs.get(codec.codec as VideoCodec);
        log.debug(`try setPublishingCodec for ${codec.codec}`, simulcastCodecInfo);
        if (!simulcastCodecInfo || !simulcastCodecInfo.sender) {
          for (const q of codec.qualities) {
            if (q.enabled) {
              newCodecs.push(codec.codec as VideoCodec);
              break;
            }
          }
        } else if (simulcastCodecInfo.encodings) {
          log.debug(`try setPublishingLayersForSender ${codec.codec}`);
          await setPublishingLayersForSender(
            simulcastCodecInfo.sender,
            simulcastCodecInfo.encodings!,
            codec.qualities,
            this.senderLock,
          );
        }
      }
    }
    return newCodecs;
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

    await setPublishingLayersForSender(this.sender, this.encodings, qualities, this.senderLock);
  }

  protected monitorSender = async () => {
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
  };

  protected async handleAppVisibilityChanged() {
    await super.handleAppVisibilityChanged();
    if (!isMobile()) return;
    if (this.isInBackground && this.source === Track.Source.Camera) {
      this._mediaStreamTrack.enabled = false;
    }
  }
}

async function setPublishingLayersForSender(
  sender: RTCRtpSender,
  senderEncodings: RTCRtpEncodingParameters[],
  qualities: SubscribedQuality[],
  senderLock: Mutex,
) {
  const unlock = await senderLock.lock();
  log.debug('setPublishingLayersForSender', { sender, qualities, senderEncodings });
  try {
    const params = sender.getParameters();
    const { encodings } = params;
    if (!encodings) {
      return;
    }

    if (encodings.length !== senderEncodings.length) {
      log.warn('cannot set publishing layers, encodings mismatch');
      return;
    }

    let hasChanged = false;

    /* disable closable spatial layer as it has video blur / frozen issue with current server / client
    1. chrome 113: when switching to up layer with scalability Mode change, it will generate a 
          low resolution frame and recover very quickly, but noticable
    2. livekit sfu: additional pli request cause video frozen for a few frames, also noticable */
    const closableSpatial = false;
    /* @ts-ignore */
    if (closableSpatial && encodings[0].scalabilityMode) {
      // svc dynacast encodings
      const encoding = encodings[0];
      /* @ts-ignore */
      // const mode = new ScalabilityMode(encoding.scalabilityMode);
      let maxQuality = VideoQuality.OFF;
      qualities.forEach((q) => {
        if (q.enabled && (maxQuality === VideoQuality.OFF || q.quality > maxQuality)) {
          maxQuality = q.quality;
        }
      });

      if (maxQuality === VideoQuality.OFF) {
        if (encoding.active) {
          encoding.active = false;
          hasChanged = true;
        }
      } else if (!encoding.active /* || mode.spatial !== maxQuality + 1*/) {
        hasChanged = true;
        encoding.active = true;
        /*
        @ts-ignore
        const originalMode = new ScalabilityMode(senderEncodings[0].scalabilityMode)
        mode.spatial = maxQuality + 1;
        mode.suffix = originalMode.suffix;
        if (mode.spatial === 1) {
          // no suffix for L1Tx
          mode.suffix = undefined;
        }
        @ts-ignore
        encoding.scalabilityMode = mode.toString();
        encoding.scaleResolutionDownBy = 2 ** (2 - maxQuality);
      */
      }
    } else {
      // simulcast dynacast encodings
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
              encoding.scaleResolutionDownBy = senderEncodings[idx].scaleResolutionDownBy;
              encoding.maxBitrate = senderEncodings[idx].maxBitrate;
              /* @ts-ignore */
              encoding.maxFrameRate = senderEncodings[idx].maxFrameRate;
            } else {
              encoding.scaleResolutionDownBy = 4;
              encoding.maxBitrate = 10;
              /* @ts-ignore */
              encoding.maxFrameRate = 2;
            }
          }
        }
      });
    }

    if (hasChanged) {
      params.encodings = encodings;
      log.debug(`setting encodings`, params.encodings);
      await sender.setParameters(params);
    }
  } finally {
    unlock();
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
  svc?: boolean,
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

  if (svc) {
    // svc layers
    /* @ts-ignore */
    const sm = new ScalabilityMode(encodings[0].scalabilityMode);
    const layers = [];
    for (let i = 0; i < sm.spatial; i += 1) {
      layers.push({
        quality: VideoQuality.HIGH - i,
        width: width / 2 ** i,
        height: height / 2 ** i,
        bitrate: encodings[0].maxBitrate ? encodings[0].maxBitrate / 3 ** i : 0,
        ssrc: 0,
      });
    }
    return layers;
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
