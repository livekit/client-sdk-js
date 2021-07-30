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
