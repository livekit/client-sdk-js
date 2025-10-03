import { AudioTrackFeature, SubscribedAudioCodec } from '@livekit/protocol';
import { TrackEvent } from '../events';
import { computeBitrate, monitorFrequency } from '../stats';
import type { AudioSenderStats } from '../stats';
import type { LoggerOptions } from '../types';
import { isReactNative, isWeb, unwrapConstraint } from '../utils';
import LocalTrack from './LocalTrack';
import { Track } from './Track';
import type { AudioCaptureOptions, AudioCodec } from './options';
import type { AudioProcessorOptions, TrackProcessor } from './processor/types';
import { constraintsForOptions, detectSilence } from './utils';

const refreshSubscribedAudioCodecAfterNewCodec = 5000;

export default class LocalAudioTrack extends LocalTrack<Track.Kind.Audio> {
  /** @internal */
  stopOnMute: boolean = false;

  private prevStats?: AudioSenderStats;

  private isKrispNoiseFilterEnabled = false;

  protected processor?: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> | undefined;

  private subscribedCodecs?: SubscribedAudioCodec[];

  /**
   * boolean indicating whether enhanced noise cancellation is currently being used on this track
   */
  get enhancedNoiseCancellation() {
    return this.isKrispNoiseFilterEnabled;
  }

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
    audioContext?: AudioContext,
    loggerOptions?: LoggerOptions,
  ) {
    super(mediaTrack, Track.Kind.Audio, constraints, userProvidedTrack, loggerOptions);
    this.audioContext = audioContext;
    this.checkForSilence();
  }

  stop() {
    this._mediaStreamTrack.getConstraints();
    this.simulcastCodecs.forEach((trackInfo) => {
      trackInfo.mediaStreamTrack.stop();
    });
    super.stop();
  }

  async pauseUpstream() {
    await super.pauseUpstream();
    for await (const sc of this.simulcastCodecs.values()) {
      await sc.sender?.replaceTrack(null);
    }
  }

  async resumeUpstream() {
    await super.resumeUpstream();
    for await (const sc of this.simulcastCodecs.values()) {
      await sc.sender?.replaceTrack(sc.mediaStreamTrack);
    }
  }

  async mute(): Promise<typeof this> {
    const unlock = await this.muteLock.lock();
    try {
      if (this.isMuted) {
        this.log.debug('Track already muted', this.logContext);
        return this;
      }

      // disabled special handling as it will cause BT headsets to switch communication modes
      if (this.source === Track.Source.Microphone && this.stopOnMute && !this.isUserProvided) {
        this.log.debug('stopping mic track', this.logContext);
        // also stop the track, so that microphone indicator is turned off
        this._mediaStreamTrack.stop();
      }
      await super.mute();
      return this;
    } finally {
      unlock();
    }
  }

  async unmute(): Promise<typeof this> {
    const unlock = await this.muteLock.lock();
    try {
      if (!this.isMuted) {
        this.log.debug('Track already unmuted', this.logContext);
        return this;
      }

      const deviceHasChanged =
        this._constraints.deviceId &&
        this._mediaStreamTrack.getSettings().deviceId !==
          unwrapConstraint(this._constraints.deviceId);

      if (
        this.source === Track.Source.Microphone &&
        (this.stopOnMute || this._mediaStreamTrack.readyState === 'ended' || deviceHasChanged) &&
        !this.isUserProvided
      ) {
        this.log.debug('reacquiring mic track', this.logContext);
        await this.restartTrack();
      }
      await super.unmute();

      return this;
    } finally {
      unlock();
    }
  }

  protected setTrackMuted(muted: boolean) {
    super.setTrackMuted(muted);
    for (const sc of this.simulcastCodecs.values()) {
      sc.mediaStreamTrack.enabled = !muted;
    }
  }

  async restartTrack(options?: AudioCaptureOptions) {
    let constraints: MediaTrackConstraints | undefined;
    if (options) {
      const streamConstraints = constraintsForOptions({ audio: options });
      if (typeof streamConstraints.audio !== 'boolean') {
        constraints = streamConstraints.audio;
      }
    }
    await this.restart(constraints);

    for await (const sc of this.simulcastCodecs.values()) {
      if (sc.sender && sc.sender.transport?.state !== 'closed') {
        sc.mediaStreamTrack = this.mediaStreamTrack.clone();
        await sc.sender.replaceTrack(sc.mediaStreamTrack);
      }
    }
  }

  protected async restart(constraints?: MediaTrackConstraints): Promise<typeof this> {
    const track = await super.restart(constraints);
    this.checkForSilence();
    return track;
  }

  /* @internal */
  startMonitor() {
    if (!isWeb()) {
      return;
    }
    if (this.monitorInterval) {
      return;
    }
    this.monitorInterval = setInterval(() => {
      this.monitorSender();
    }, monitorFrequency);
  }

  protected monitorSender = async () => {
    if (!this.sender) {
      this._currentBitrate = 0;
      return;
    }

    let stats: AudioSenderStats | undefined;
    try {
      stats = await this.getSenderStats();
    } catch (e) {
      this.log.error('could not get audio sender stats', { ...this.logContext, error: e });
      return;
    }

    if (stats && this.prevStats) {
      this._currentBitrate = computeBitrate(stats, this.prevStats);
    }

    this.prevStats = stats;
  };

  private handleKrispNoiseFilterEnable = () => {
    this.isKrispNoiseFilterEnabled = true;
    this.log.debug(`Krisp noise filter enabled`, this.logContext);
    this.emit(
      TrackEvent.AudioTrackFeatureUpdate,
      this,
      AudioTrackFeature.TF_ENHANCED_NOISE_CANCELLATION,
      true,
    );
  };

  private handleKrispNoiseFilterDisable = () => {
    this.isKrispNoiseFilterEnabled = false;
    this.log.debug(`Krisp noise filter disabled`, this.logContext);
    this.emit(
      TrackEvent.AudioTrackFeatureUpdate,
      this,
      AudioTrackFeature.TF_ENHANCED_NOISE_CANCELLATION,
      false,
    );
  };

  async setProcessor(processor: TrackProcessor<Track.Kind.Audio, AudioProcessorOptions>) {
    const unlock = await this.trackChangeLock.lock();
    try {
      if (!isReactNative() && !this.audioContext) {
        throw Error(
          'Audio context needs to be set on LocalAudioTrack in order to enable processors',
        );
      }
      if (this.processor) {
        await this.internalStopProcessor();
      }

      const processorOptions = {
        kind: this.kind,
        track: this._mediaStreamTrack,
        // RN won't have or use AudioContext
        audioContext: this.audioContext as AudioContext,
      };
      this.log.debug(`setting up audio processor ${processor.name}`, this.logContext);

      await processor.init(processorOptions);
      this.processor = processor;
      if (this.processor.processedTrack) {
        await this.sender?.replaceTrack(this.processor.processedTrack);
        for await (const sc of this.simulcastCodecs.values()) {
          await sc.sender?.replaceTrack(this.processor.processedTrack);
        }
        this.processor.processedTrack.addEventListener(
          'enable-lk-krisp-noise-filter',
          this.handleKrispNoiseFilterEnable,
        );
        this.processor.processedTrack.addEventListener(
          'disable-lk-krisp-noise-filter',
          this.handleKrispNoiseFilterDisable,
        );
      }
      this.emit(TrackEvent.TrackProcessorUpdate, this.processor);
    } finally {
      unlock();
    }
  }

  setupSusbcribedCodecsRefresh() {
    // browser will reenable disabled codec/layers after new codec has been published,
    // so refresh subscribedCodecs after publish a new codec
    setTimeout(() => {
      if (this.subscribedCodecs) {
        this.setPublishingCodecs(this.subscribedCodecs);
      }
    }, refreshSubscribedAudioCodecAfterNewCodec);
  }

  /**
   * @internal
   * Sets codecs that should be publishing, returns new codecs that have not yet
   * been published
   */
  async setPublishingCodecs(codecs: SubscribedAudioCodec[]): Promise<AudioCodec[]> {
    this.log.debug('setting publishing codecs', {
      ...this.logContext,
      codecs,
      currentCodec: this.codec,
    });
    // only enable simulcast codec for preference codec setted
    if (!this.codec && codecs.length > 0) {
      return [];
    }

    this.subscribedCodecs = codecs;

    const newCodecs: AudioCodec[] = [];
    for await (const codec of codecs) {
      if (!this.codec || this.codec === codec.codec) {
        this.mediaStreamTrack.enabled = codec.enabled;
        continue;
      }

      const simulcastCodecInfo = this.simulcastCodecs.get(codec.codec as AudioCodec);
      this.log.debug(`try setPublishingCodec for ${codec.codec}`, {
        ...this.logContext,
        simulcastCodecInfo,
      });
      if (!simulcastCodecInfo || !simulcastCodecInfo.sender) {
        if (codec.enabled) {
          newCodecs.push(codec.codec as AudioCodec);
        }
      }
    }
    return newCodecs;
  }

  /**
   * @internal
   * @experimental
   */
  setAudioContext(audioContext: AudioContext | undefined) {
    this.audioContext = audioContext;
  }

  async getSenderStats(): Promise<AudioSenderStats | undefined> {
    if (!this.sender?.getStats) {
      return undefined;
    }

    const stats = await this.sender.getStats();
    let audioStats: AudioSenderStats | undefined;
    stats.forEach((v) => {
      if (v.type === 'outbound-rtp') {
        audioStats = {
          type: 'audio',
          streamId: v.id,
          packetsSent: v.packetsSent,
          packetsLost: v.packetsLost,
          bytesSent: v.bytesSent,
          timestamp: v.timestamp,
          roundTripTime: v.roundTripTime,
          jitter: v.jitter,
        };
      }
    });

    return audioStats;
  }

  async checkForSilence() {
    const trackIsSilent = await detectSilence(this);
    if (trackIsSilent) {
      if (!this.isMuted) {
        this.log.debug('silence detected on local audio track', this.logContext);
      }
      this.emit(TrackEvent.AudioSilenceDetected);
    }
    return trackIsSilent;
  }
}
