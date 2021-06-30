import { TrackInfo } from '../../proto/livekit_models';
import {
  UpdateSubscription,
  UpdateTrackSettings,
  VideoQuality,
} from '../../proto/livekit_rtc';
import { TrackEvent } from '../events';
import TrackPublication from './TrackPublication';
import { RemoteTrack } from './types';

export default class RemoteTrackPublication extends TrackPublication {
  track?: RemoteTrack;

  protected subscribed?: boolean;

  protected disabled: boolean = false;

  protected currentVideoQuality: VideoQuality = VideoQuality.HIGH;

  /**
   * Subscribe or unsubscribe to this remote track
   * @param subscribed true to subscribe to a track, false to unsubscribe
   */
  setSubscribed(subscribed: boolean) {
    this.subscribed = subscribed;

    const sub: UpdateSubscription = {
      trackSids: [this.trackSid],
      subscribe: this.subscribed,
    };
    this.emit(TrackEvent.UpdateSubscription, sub);
  }

  get isSubscribed(): boolean {
    if (this.subscribed === false) {
      return false;
    }
    return super.isSubscribed;
  }

  get isEnabled(): boolean {
    return !this.disabled;
  }

  /**
   * disable server from sending down data for this track. this is useful when
   * the participant is off screen, you may disable streaming down their video
   * to reduce bandwidth requirements
   * @param enabled
   */
  setEnabled(enabled: boolean) {
    if (this.disabled === !enabled) {
      return;
    }
    this.disabled = !enabled;

    this.emitTrackUpdate();
  }

  /**
   * for tracks that support simulcasting, adjust subscribed quality
   *
   * This indicates the highest quality the client can accept. if network
   * bandwidth does not allow, server will automatically reduce quality to
   * optimize for uninterrupted video
   */
  setVideoQuality(quality: VideoQuality) {
    if (this.currentVideoQuality === quality) {
      return;
    }
    this.currentVideoQuality = quality;

    this.emitTrackUpdate();
  }

  get videoQuality(): VideoQuality {
    return this.currentVideoQuality;
  }

  /** @internal */
  updateInfo(info: TrackInfo) {
    super.updateInfo(info);
    this.metadataMuted = info.muted;
    this.track?.setMuted(info.muted);
  }

  protected emitTrackUpdate() {
    const settings: UpdateTrackSettings = {
      trackSids: [this.trackSid],
      disabled: this.disabled,
      quality: this.currentVideoQuality,
    };

    this.emit(TrackEvent.UpdateSettings, settings);
  }
}
