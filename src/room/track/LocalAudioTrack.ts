import { AudioTrack } from './AudioTrack';
import { Track } from './Track';
import { restartTrack, setTrackMuted } from './utils';

export class LocalAudioTrack extends AudioTrack {
  id: Track.SID;
  sender?: RTCRtpSender;
  _constraints: MediaTrackConstraints;

  constructor(
    mediaTrack: MediaStreamTrack,
    name?: string,
    constraints?: MediaTrackConstraints
  ) {
    super(mediaTrack, name);
    this.id = mediaTrack.id;
    this._constraints = constraints || {};
  }

  mute(): LocalAudioTrack {
    setTrackMuted(this, true);
    return this;
  }

  unmute(): LocalAudioTrack {
    setTrackMuted(this, false);
    return this;
  }

  restart(constraints?: MediaTrackConstraints) {
    restartTrack(this, constraints);
  }
}
