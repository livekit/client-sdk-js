import { TrackInfo } from '../../proto/livekit_models';
import LocalAudioTrack from './LocalAudioTrack';
import LocalTrack from './LocalTrack';
import LocalVideoTrack from './LocalVideoTrack';
import { Track } from './Track';
import TrackPublication from './TrackPublication';

export default class LocalTrackPublication extends TrackPublication {
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

  get audioTrack(): LocalAudioTrack | undefined {
    return super.audioTrack as LocalAudioTrack | undefined;
  }

  get videoTrack(): LocalVideoTrack | undefined {
    return super.videoTrack as LocalVideoTrack | undefined;
  }

  /**
   * Mute the track associated with this publication
   */
  async mute() {
    return this.track?.mute();
  }

  /**
   * Unmute track associated with this publication
   */
  async unmute() {
    return this.track?.unmute();
  }
}
