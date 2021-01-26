import { EventEmitter } from 'events';
import { TrackInfo } from '../../proto/model';
import { Track } from './Track';

export class TrackPublication extends EventEmitter {
  kind: Track.Kind;
  trackName: string;
  trackSid: Track.SID;
  track?: Track;

  constructor(kind: Track.Kind, id: string, name: string) {
    super();
    this.kind = kind;
    this.trackSid = id;
    this.trackName = name;
  }

  updateMetadata(info: TrackInfo) {
    this.trackSid = info.sid;
    this.trackName = info.name;
  }
}
