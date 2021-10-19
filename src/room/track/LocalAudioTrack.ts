import LocalTrack from './LocalTrack';
import { CreateAudioTrackOptions } from './options';
import { Track } from './Track';

export default class LocalAudioTrack extends LocalTrack {
  sender?: RTCRtpSender;

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
    await this.restartTrack();
    if (this.isMuted) {
      this.mediaStreamTrack.enabled = false;
    }
  }

  async mute(): Promise<LocalAudioTrack> {
    if (this.source === Track.Source.Microphone) {
      // also stop the track, so that camera indicator is turned off
      this.mediaStreamTrack.stop();
    }
    await super.mute();
    return this;
  }

  async unmute(): Promise<LocalAudioTrack> {
    if (this.source === Track.Source.Microphone) {
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
