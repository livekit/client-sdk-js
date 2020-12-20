import { AudioTrack } from './AudioTrack';
import { Track } from './Track';

export class RemoteAudioTrack extends AudioTrack {
  // whether the remote audio track is switched off
  isSwitchedOff: boolean = false;
  sid: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, sid: string) {
    super(mediaTrack);
    this.sid = sid;
  }
}
