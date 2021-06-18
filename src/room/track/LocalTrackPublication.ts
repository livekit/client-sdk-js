import { TrackInfo } from '../../proto/livekit_models';
import LocalTrack from './LocalTrack';
import { Track } from './Track';
import TrackPublication from './TrackPublication';

export default class LocalTrackPublication extends TrackPublication {
  priority?: Track.Priority;

  track?: LocalTrack;

  constructor(kind: Track.Kind, ti: TrackInfo, track?: LocalTrack) {
    super(kind, ti.sid, ti.name);

    this.updateInfo(ti);
    this.setTrack(track);
  }

  get isMuted(): boolean {
    if (this.track) {
      return this.track.isMuted;
    }
    return super.isMuted;
  }

  /**
   * Mute the track associated with this publication
   */
  mute() {
    this.track?.mute();
  }

  /**
   * Unmute track associated with this publication
   */
  unmute() {
    this.track?.unmute();
  }
}
