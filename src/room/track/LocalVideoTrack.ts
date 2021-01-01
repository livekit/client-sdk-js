import { Track } from './Track';
import { setTrackMuted } from './utils';
import { VideoTrack } from './VideoTrack';

export class LocalVideoTrack extends VideoTrack {
  id: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(mediaTrack, name);
    this.id = mediaTrack.id;
  }

  mute(): LocalVideoTrack {
    setTrackMuted(this, true);
    return this;
  }

  unmute(): LocalVideoTrack {
    setTrackMuted(this, false);
    return this;
  }
}
