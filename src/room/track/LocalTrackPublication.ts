import { TrackInfo } from '../../proto/livekit_models';
import { LocalAudioTrack } from './LocalAudioTrack';
import { LocalVideoTrack } from './LocalVideoTrack';
import { Track } from './Track';
import { TrackPublication } from './TrackPublication';
import { LocalTrack } from './types';
import { setTrackMuted } from './utils';

export class LocalTrackPublication extends TrackPublication {
  priority?: Track.Priority;
  track?: LocalTrack;

  constructor(kind: Track.Kind, ti: TrackInfo, track?: LocalTrack) {
    super(kind, ti.sid, ti.name);

    this.setTrack(track);
  }

  get isMuted(): boolean {
    if (!this.track) {
      return false;
    }
    return this.track.isMuted;
  }

  /**
   * Mute the track associated with this publication
   */
  mute() {
    if (
      this.track instanceof LocalVideoTrack ||
      this.track instanceof LocalAudioTrack
    ) {
      setTrackMuted(this.track, true);
    }
  }

  /**
   * Unmute track associated with this publication
   */
  unmute() {
    if (
      this.track instanceof LocalVideoTrack ||
      this.track instanceof LocalAudioTrack
    ) {
      setTrackMuted(this.track, false);
    }
  }
}
