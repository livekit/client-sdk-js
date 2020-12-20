import { AudioTrack } from './AudioTrack';
import { Track } from './Track';

export class LocalAudioTrack extends AudioTrack {
  id: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(mediaTrack, name);
    this.id = mediaTrack.id;
  }
}
