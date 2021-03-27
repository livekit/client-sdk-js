import { TrackInfo } from '../../proto/livekit_models';
import { TrackEvent } from '../events';
import { Track } from './Track';
import { TrackPublication } from './TrackPublication';
import { LocalTrack } from './types';

export class LocalTrackPublication extends TrackPublication {
  priority?: Track.Priority;
  track?: LocalTrack;

  constructor(kind: Track.Kind, ti: TrackInfo, track?: LocalTrack) {
    super(kind, ti.sid, ti.name);

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
}
