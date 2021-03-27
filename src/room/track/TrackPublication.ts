import { EventEmitter } from 'events';
import { TrackInfo } from '../../proto/livekit_models';
import { TrackEvent } from '../events';
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

  /** @internal */
  setTrack(track?: Track) {
    this.track = track;

    if (track) {
      // forward events
      track.on(TrackEvent.Muted, () => {
        this.emit(TrackEvent.Muted);
      });

      track.on(TrackEvent.Unmuted, () => {
        this.emit(TrackEvent.Unmuted);
      });
    }
  }

  /** @internal */
  updateInfo(info: TrackInfo) {
    this.trackSid = info.sid;
    this.trackName = info.name;
  }
}
