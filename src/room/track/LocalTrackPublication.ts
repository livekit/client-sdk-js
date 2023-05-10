import type { TrackInfo } from '../../proto/livekit_models';
import { TrackEvent } from '../events';
import type LocalAudioTrack from './LocalAudioTrack';
import type LocalTrack from './LocalTrack';
import type LocalVideoTrack from './LocalVideoTrack';
import type { Track } from './Track';
import { TrackPublication } from './TrackPublication';
import type { TrackPublishOptions } from './options';

export default class LocalTrackPublication extends TrackPublication {
  track?: LocalTrack = undefined;

  options?: TrackPublishOptions;

  get isUpstreamPaused() {
    return this.track?.isUpstreamPaused;
  }

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

  /**
   * Pauses the media stream track associated with this publication from being sent to the server
   * and signals "muted" event to other participants
   * Useful if you want to pause the stream without pausing the local media stream track
   */
  async pauseUpstream() {
    await this.track?.pauseUpstream();
  }

  /**
   * Resumes sending the media stream track associated with this publication to the server after a call to [[pauseUpstream()]]
   * and signals "unmuted" event to other participants (unless the track is explicitly muted)
   */
  async resumeUpstream() {
    await this.track?.resumeUpstream();
  }

  handleTrackEnded = () => {
    this.emit(TrackEvent.Ended);
  };
}
