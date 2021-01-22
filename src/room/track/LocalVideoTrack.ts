import { Track } from './Track';
import { restartTrack, setTrackMuted } from './utils';
import { VideoTrack } from './VideoTrack';

export class LocalVideoTrack extends VideoTrack {
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

  mute(): LocalVideoTrack {
    setTrackMuted(this, true);
    return this;
  }

  unmute(): LocalVideoTrack {
    setTrackMuted(this, false);
    return this;
  }

  restart(constraints?: MediaTrackConstraints) {
    restartTrack(this, constraints);
  }
}
