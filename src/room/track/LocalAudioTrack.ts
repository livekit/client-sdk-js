import { AudioTrack } from './AudioTrack';
import { Track } from './Track';
import { setTrackMuted } from './utils';

export class LocalAudioTrack extends AudioTrack {
  id: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(mediaTrack, name);
    this.id = mediaTrack.id;
  }

  mute(): LocalAudioTrack {
    setTrackMuted(this, true);
    return this;
  }

  unmute(): LocalAudioTrack {
    setTrackMuted(this, false);
    return this;
  }
}
