import { TrackInfo } from '../../proto/livekit_models';
import { TrackEvent } from '../events';
import LocalAudioTrack from './LocalAudioTrack';
import LocalTrack from './LocalTrack';
import LocalVideoTrack from './LocalVideoTrack';
import { TrackPublishOptions } from './options';
import { Track } from './Track';
import { TrackPublication } from './TrackPublication';

export default class LocalTrackPublication extends TrackPublication {
  track?: LocalTrack;

  options?: TrackPublishOptions;

  constructor(kind: Track.Kind, ti: TrackInfo, track?: LocalTrack) {
    super(kind, ti.sid, ti.name);

    this.updateInfo(ti);
    this.setTrack(track);
  }

  setTrack(track?: Track) {
    if (this.track) {
      this.track.off(TrackEvent.Ended, this.handleTrackEnded);
    }

    super.setTrack(track);

    if (track) {
      track.on(TrackEvent.Ended, this.handleTrackEnded);
    }
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

  detachTrack() {
    this.track?.detachTrack();
    this.emit(TrackEvent.UpstreamHalted, this.track);
  }

  attachTrack(track: LocalTrack) {
    this.track?.attachTrack();
    this.emit(TrackEvent.UpstreamResumed, track);
  }

  handleTrackEnded = (track: LocalTrack) => {
    this.emit(TrackEvent.Ended, track);
  };
}
