import { TrackInfo } from '../../proto/livekit_models';
import { TrackEvent } from '../events';
import { LocalTrackPublication } from './LocalTrackPublication';
import { LocalVideoTrack } from './LocalVideoTrack';
import { Track } from './Track';

export class LocalVideoTrackPublication extends LocalTrackPublication {
  readonly track: LocalVideoTrack;

  constructor(track: LocalVideoTrack, ti: TrackInfo) {
    super(Track.Kind.Video, ti);
    this.track = track;

    // forward events
    track.on(TrackEvent.Muted, () => {
      this.emit(TrackEvent.Muted);
    });

    track.on(TrackEvent.Unmuted, () => {
      this.emit(TrackEvent.Unmuted);
    });
  }
}
