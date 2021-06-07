import LocalTrack from './LocalTrack';
import { Track } from './Track';

export default class LocalAudioTrack extends LocalTrack {
  sender?: RTCRtpSender;

  protected constraints: MediaTrackConstraints;

  constructor(
    mediaTrack: MediaStreamTrack,
    name?: string,
    constraints?: MediaTrackConstraints,
  ) {
    super(mediaTrack, Track.Kind.Audio, name);
    this.constraints = constraints || {};
  }
}
