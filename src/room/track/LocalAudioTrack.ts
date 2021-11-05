import log from '../../logger';
import LocalTrack from './LocalTrack';
import { CreateAudioTrackOptions } from './options';
import { Track } from './Track';

export default class LocalAudioTrack extends LocalTrack {
  sender?: RTCRtpSender;

  /** @internal */
  stopOnMute: boolean = false;

  constructor(
    mediaTrack: MediaStreamTrack,
    name?: string,
    constraints?: MediaTrackConstraints,
  ) {
    super(mediaTrack, Track.Kind.Audio, name, constraints);
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
    // disabled special handling as it will cause BT headsets to switch communication modes
    if (this.source === Track.Source.Microphone && this.stopOnMute) {
      log.debug('stopping mic track');
      // also stop the track, so that microphone indicator is turned off
      this.mediaStreamTrack.stop();
    }
    await super.mute();
    return this;
  }

  async unmute(): Promise<LocalAudioTrack> {
    if (this.source === Track.Source.Microphone && this.stopOnMute) {
      log.debug('reacquiring mic track');
      await this.restartTrack();
    }
    await super.unmute();
    return this;
  }

  async restartTrack(options?: CreateAudioTrackOptions) {
    let constraints: MediaTrackConstraints | undefined;
    if (options) {
      const streamConstraints = LocalTrack.constraintsForOptions({ audio: options });
      if (typeof streamConstraints.audio !== 'boolean') {
        constraints = streamConstraints.audio;
      }
    }
    await this.restart(constraints);
  }
}
