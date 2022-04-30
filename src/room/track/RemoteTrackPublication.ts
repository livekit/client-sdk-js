import log from '../../logger';
import { TrackInfo, VideoQuality } from '../../proto/livekit_models';
import { UpdateSubscription, UpdateTrackSettings } from '../../proto/livekit_rtc';
import { TrackEvent } from '../events';
import RemoteVideoTrack from './RemoteVideoTrack';
import { Track } from './Track';
import { TrackPublication } from './TrackPublication';
import { RemoteTrack } from './types';

export default class RemoteTrackPublication extends TrackPublication {
  track?: RemoteTrack;

  /** @internal */
  _allowed = true;

  // keeps track of client's desire to subscribe to a track
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
      participantTracks: [
        {
          // sending an empty participant id since TrackPublication doesn't keep it
          // this is filled in by the participant that receives this message
          participantSid: '',
          trackSids: [this.trackSid],
        },
      ],
    };
    this.emit(TrackEvent.UpdateSubscription, sub);
  }

  get subscriptionStatus(): TrackPublication.SubscriptionStatus {
    if (this.subscribed === false || !super.isSubscribed) {
      return TrackPublication.SubscriptionStatus.Unsubscribed;
    }
    if (!this._allowed) {
      return TrackPublication.SubscriptionStatus.NotAllowed;
    }
    return TrackPublication.SubscriptionStatus.Subscribed;
  }

  /**
   * Returns true if track is subscribed, and ready for playback
   */
  get isSubscribed(): boolean {
    if (this.subscribed === false) {
      return false;
    }
    if (!this._allowed) {
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
    if (!this.isManualOperationAllowed() || this.disabled === !enabled) {
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
    if (!this.isManualOperationAllowed() || this.currentVideoQuality === quality) {
      return;
    }
    this.currentVideoQuality = quality;
    this.videoDimensions = undefined;

    this.emitTrackUpdate();
  }

  setVideoDimensions(dimensions: Track.Dimensions) {
    if (!this.isManualOperationAllowed()) {
      return;
    }
    if (
      this.videoDimensions?.width === dimensions.width &&
      this.videoDimensions?.height === dimensions.height
    ) {
      return;
    }
    if (this.track instanceof RemoteVideoTrack) {
      this.videoDimensions = dimensions;
    }
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
      this.track.off(TrackEvent.Ended, this.handleEnded);
    }
    super.setTrack(track);
    if (track) {
      track.sid = this.trackSid;
      track.on(TrackEvent.VideoDimensionsChanged, this.handleVideoDimensionsChange);
      track.on(TrackEvent.VisibilityChanged, this.handleVisibilityChange);
      track.on(TrackEvent.Ended, this.handleEnded);
    }
  }

  /** @internal */
  updateInfo(info: TrackInfo) {
    super.updateInfo(info);
    this.metadataMuted = info.muted;
    this.track?.setMuted(info.muted);
  }

  private isManualOperationAllowed(): boolean {
    if (this.isAdaptiveStream) {
      log.warn('adaptive stream is enabled, cannot change track settings', {
        trackSid: this.trackSid,
      });
      return false;
    }
    if (!this.isSubscribed) {
      log.warn('cannot update track settings when not subscribed', { trackSid: this.trackSid });
      return false;
    }
    return true;
  }

  protected handleEnded = (track: RemoteTrack) => {
    this.emit(TrackEvent.Ended, track);
  };

  protected get isAdaptiveStream(): boolean {
    return this.track instanceof RemoteVideoTrack && this.track.isAdaptiveStream;
  }

  protected handleVisibilityChange = (visible: boolean) => {
    log.debug(`adaptivestream video visibility ${this.trackSid}, visible=${visible}`, {
      trackSid: this.trackSid,
    });
    this.disabled = !visible;
    this.emitTrackUpdate();
  };

  protected handleVideoDimensionsChange = (dimensions: Track.Dimensions) => {
    log.debug(`adaptivestream video dimensions ${dimensions.width}x${dimensions.height}`, {
      trackSid: this.trackSid,
    });
    this.videoDimensions = dimensions;
    this.emitTrackUpdate();
  };

  /* @internal */
  emitTrackUpdate() {
    const settings: UpdateTrackSettings = UpdateTrackSettings.fromPartial({
      trackSids: [this.trackSid],
      disabled: this.disabled,
    });
    if (this.videoDimensions) {
      settings.width = this.videoDimensions.width;
      settings.height = this.videoDimensions.height;
    } else if (this.currentVideoQuality !== undefined) {
      settings.quality = this.currentVideoQuality;
    } else {
      // defaults to high quality
      settings.quality = VideoQuality.HIGH;
    }

    log.debug('emit settings', settings);
    this.emit(TrackEvent.UpdateSettings, settings);
  }
}
