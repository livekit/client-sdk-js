import { TrackInfo } from '../../proto/model';
import { TrackEvent } from '../events';
import { LocalAudioTrack } from './LocalAudioTrack';
import { LocalTrackPublication } from './LocalTrackPublication';
import { Track } from './Track';

export class LocalAudioTrackPublication extends LocalTrackPublication {
  readonly track: LocalAudioTrack;

  constructor(track: LocalAudioTrack, ti: TrackInfo) {
    super(Track.Kind.Audio, ti);
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
