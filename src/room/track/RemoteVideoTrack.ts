import { Track } from './Track';
import { VideoTrack } from './VideoTrack';

export class RemoteVideoTrack extends VideoTrack {
  sid: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, sid: string) {
    super(mediaTrack);
    // override id to parsed ID
    this.sid = sid;
  }
}
