import log from '../../logger'
import { TrackEvent } from '../events'
import { AudioSenderStats, computeBitrate, monitorFrequency } from '../stats'
import { isWeb } from '../utils'
import LocalTrack from './LocalTrack'
import { AudioCaptureOptions } from './options'
import { Track } from './Track'
import { constraintsForOptions, detectSilence } from './utils'

export default class LocalAudioTrack extends LocalTrack {
  sender?: RTCRtpSender;

  /** @internal */
  stopOnMute: boolean = false;

  private prevStats?: AudioSenderStats;

  constructor(
    mediaTrack: MediaStreamTrack,
    constraints?: MediaTrackConstraints,
    userProvidedTrack = true,
  ) {
    super(mediaTrack, Track.Kind.Audio, constraints, userProvidedTrack);
    this.checkForSilence();
  }

  async setDeviceId(deviceId: string) {
    if (this.constraints.deviceId === deviceId) {
      return;
    }
    this.constraints.deviceId = deviceId;
    if (!this.isMuted) {
      await this.restartTrack();
    }
  }

  async mute(): Promise<LocalAudioTrack> {
    await this.muteQueue.run(async () => {
      // disabled special handling as it will cause BT headsets to switch communication modes
      if (this.source === Track.Source.Microphone && this.stopOnMute && !this.isUserProvided) {
        log.debug('stopping mic track');
        // also stop the track, so that microphone indicator is turned off
        this._mediaStreamTrack.stop();
      }
      await super.mute();
    });
    return this;
  }

  async unmute(): Promise<LocalAudioTrack> {
    await this.muteQueue.run(async () => {
      if (this.source === Track.Source.Microphone && this.stopOnMute && !this.isUserProvided) {
        log.debug('reacquiring mic track');
        await this.restartTrack();
      }
      await super.unmute();
    });
    return this;
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
  }

  protected async restart(constraints?: MediaTrackConstraints): Promise<LocalTrack> {
    const track = await super.restart(constraints);
    this.checkForSilence();
    return track;
  }

  /* @internal */
  startMonitor() {
    if (!isWeb()) {
      return;
    }
    setTimeout(() => {
      this.monitorSender();
    }, monitorFrequency);
  }

  private monitorSender = async () => {
    if (!this.sender) {
      this._currentBitrate = 0;
      return;
    }

    let stats: AudioSenderStats | undefined;
    try {
      stats = await this.getSenderStats();
    } catch (e) {
      log.error('could not get audio sender stats', { error: e });
      return;
    }

    if (stats && this.prevStats) {
      this._currentBitrate = computeBitrate(stats, this.prevStats);
    }

    this.prevStats = stats;
    setTimeout(() => {
      this.monitorSender();
    }, monitorFrequency);
  };

  async getSenderStats(): Promise<AudioSenderStats | undefined> {
    if (!this.sender) {
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
        log.warn('silence detected on local audio track');
      }
      this.emit(TrackEvent.AudioSilenceDetected);
    }
  }
}
