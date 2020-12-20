import { Track } from './Track';
import { VideoTrack } from './VideoTrack';

export class LocalVideoTrack extends VideoTrack {
  id: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(mediaTrack, name);
    this.id = mediaTrack.id;
  }
}
