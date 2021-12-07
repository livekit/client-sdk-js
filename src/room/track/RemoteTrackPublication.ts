import log from '../../logger';
import { TrackInfo } from '../../proto/livekit_models';
import {
  UpdateSubscription,
  UpdateTrackSettings,
  VideoQuality,
} from '../../proto/livekit_rtc';
import { TrackEvent } from '../events';
import RemoteVideoTrack from './RemoteVideoTrack';
import { Track } from './Track';
import TrackPublication from './TrackPublication';
import { RemoteTrack } from './types';

export default class RemoteTrackPublication extends TrackPublication {
  track?: RemoteTrack;

  protected subscribed?: boolean;

  protected disabled: boolean = false;

  protected currentVideoQuality?: VideoQuality = VideoQuality.HIGH;

  protected videoDimensions?: Track.Dimensions;

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
    if (this.isAutoManageVideo || !this.isSubscribed || this.disabled === !enabled) {
      return;
    }
    if (this.track instanceof RemoteVideoTrack && this.track.isAutoManaged) {
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
    if (this.isAutoManageVideo || !this.isSubscribed || this.currentVideoQuality === quality) {
      return;
    }
    this.currentVideoQuality = quality;
    this.videoDimensions = undefined;

    this.emitTrackUpdate();
  }

  setVideoDimensions(dimensions: Track.Dimensions) {
    if (!this.isSubscribed || this.isAutoManageVideo) {
      return;
    }
    if (this.videoDimensions?.width === dimensions.width
        && this.videoDimensions?.height === dimensions.height) {
      return;
    }
    if (this.track instanceof RemoteVideoTrack) { this.videoDimensions = dimensions; }
    this.currentVideoQuality = undefined;

    this.emitTrackUpdate();
  }

  get videoQuality(): VideoQuality | undefined {
    return this.currentVideoQuality;
  }

  setTrack(track?: Track) {
    if (this.track) {
      // unregister listener
      this.track.off(TrackEvent.VideoDimensionsChanged, this.handleVideoDimensionsChange);
      this.track.off(TrackEvent.VisibilityChanged, this.handleVisibilityChange);
    }
    super.setTrack(track);
    this.track?.on(TrackEvent.VideoDimensionsChanged, this.handleVideoDimensionsChange);
    this.track?.on(TrackEvent.VisibilityChanged, this.handleVisibilityChange);
  }

  /** @internal */
  updateInfo(info: TrackInfo) {
    super.updateInfo(info);
    this.metadataMuted = info.muted;
    this.track?.setMuted(info.muted);
  }

  protected get isAutoManageVideo(): boolean {
    return this.track instanceof RemoteVideoTrack && this.track.isAutoManaged;
  }

  protected handleVisibilityChange = (visible: boolean) => {
    log.debug('automanage video visibility', this.trackSid, `visible=${visible}`);
    this.disabled = !visible;
    this.emitTrackUpdate();
  };

  protected handleVideoDimensionsChange = (dimensions: Track.Dimensions) => {
    log.debug('automanage video dimensions', this.trackSid, `${dimensions.width}x${dimensions.height}`);
    this.videoDimensions = dimensions;
    this.emitTrackUpdate();
  };

  protected emitTrackUpdate() {
    const settings: UpdateTrackSettings = UpdateTrackSettings.fromPartial({
      trackSids: [this.trackSid],
      disabled: this.disabled,
    });
    if (this.videoDimensions) {
      settings.width = this.videoDimensions.width;
      settings.height = this.videoDimensions.height;
    } else if (this.currentVideoQuality) {
      settings.quality = this.currentVideoQuality;
    } else {
      // defaults to high quality
      settings.quality = VideoQuality.HIGH;
    }

    this.emit(TrackEvent.UpdateSettings, settings);
  }
}
