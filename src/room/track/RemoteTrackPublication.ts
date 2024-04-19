import {
  ParticipantTracks,
  SubscriptionError,
  TrackInfo,
  UpdateSubscription,
  UpdateTrackSettings,
} from '@livekit/protocol';
import { TrackEvent } from '../events';
import type { LoggerOptions } from '../types';
import type RemoteTrack from './RemoteTrack';
import RemoteVideoTrack from './RemoteVideoTrack';
import { Track, VideoQuality } from './Track';
import { TrackPublication } from './TrackPublication';

export default class RemoteTrackPublication extends TrackPublication {
  track?: RemoteTrack = undefined;

  /** @internal */
  protected allowed = true;

  // keeps track of client's desire to subscribe to a track, also true if autoSubscribe is active
  protected subscribed?: boolean;

  protected disabled: boolean = false;

  protected currentVideoQuality?: VideoQuality = VideoQuality.HIGH;

  protected videoDimensions?: Track.Dimensions;

  protected fps?: number;

  protected subscriptionError?: SubscriptionError;

  constructor(
    kind: Track.Kind,
    ti: TrackInfo,
    autoSubscribe: boolean | undefined,
    loggerOptions?: LoggerOptions,
  ) {
    super(kind, ti.sid, ti.name, loggerOptions);
    this.subscribed = autoSubscribe;
    this.updateInfo(ti);
  }

  /**
   * Subscribe or unsubscribe to this remote track
   * @param subscribed true to subscribe to a track, false to unsubscribe
   */
  setSubscribed(subscribed: boolean) {
    const prevStatus = this.subscriptionStatus;
    const prevPermission = this.permissionStatus;
    this.subscribed = subscribed;
    // reset allowed status when desired subscription state changes
    // server will notify client via signal message if it's not allowed
    if (subscribed) {
      this.allowed = true;
    }

    const sub = new UpdateSubscription({
      trackSids: [this.trackSid],
      subscribe: this.subscribed,
      participantTracks: [
        new ParticipantTracks({
          // sending an empty participant id since TrackPublication doesn't keep it
          // this is filled in by the participant that receives this message
          participantSid: '',
          trackSids: [this.trackSid],
        }),
      ],
    });
    this.emit(TrackEvent.UpdateSubscription, sub);
    this.emitSubscriptionUpdateIfChanged(prevStatus);
    this.emitPermissionUpdateIfChanged(prevPermission);
  }

  get subscriptionStatus(): TrackPublication.SubscriptionStatus {
    if (this.subscribed === false) {
      return TrackPublication.SubscriptionStatus.Unsubscribed;
    }
    if (!super.isSubscribed) {
      return TrackPublication.SubscriptionStatus.Desired;
    }
    return TrackPublication.SubscriptionStatus.Subscribed;
  }

  get permissionStatus(): TrackPublication.PermissionStatus {
    return this.allowed
      ? TrackPublication.PermissionStatus.Allowed
      : TrackPublication.PermissionStatus.NotAllowed;
  }

  /**
   * Returns true if track is subscribed, and ready for playback
   */
  get isSubscribed(): boolean {
    if (this.subscribed === false) {
      return false;
    }
    return super.isSubscribed;
  }

  // returns client's desire to subscribe to a track, also true if autoSubscribe is enabled
  get isDesired(): boolean {
    return this.subscribed !== false;
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

  setVideoFPS(fps: number) {
    if (!this.isManualOperationAllowed()) {
      return;
    }

    if (!(this.track instanceof RemoteVideoTrack)) {
      return;
    }

    if (this.fps === fps) {
      return;
    }

    this.fps = fps;
    this.emitTrackUpdate();
  }

  get videoQuality(): VideoQuality | undefined {
    return this.currentVideoQuality;
  }

  /** @internal */
  setTrack(track?: RemoteTrack) {
    const prevStatus = this.subscriptionStatus;
    const prevPermission = this.permissionStatus;
    const prevTrack = this.track;
    if (prevTrack === track) {
      return;
    }
    if (prevTrack) {
      // unregister listener
      prevTrack.off(TrackEvent.VideoDimensionsChanged, this.handleVideoDimensionsChange);
      prevTrack.off(TrackEvent.VisibilityChanged, this.handleVisibilityChange);
      prevTrack.off(TrackEvent.Ended, this.handleEnded);
      prevTrack.detach();
      prevTrack.stopMonitor();
      this.emit(TrackEvent.Unsubscribed, prevTrack);
    }
    super.setTrack(track);
    if (track) {
      track.sid = this.trackSid;
      track.on(TrackEvent.VideoDimensionsChanged, this.handleVideoDimensionsChange);
      track.on(TrackEvent.VisibilityChanged, this.handleVisibilityChange);
      track.on(TrackEvent.Ended, this.handleEnded);
      this.emit(TrackEvent.Subscribed, track);
    }
    this.emitPermissionUpdateIfChanged(prevPermission);
    this.emitSubscriptionUpdateIfChanged(prevStatus);
  }

  /** @internal */
  setAllowed(allowed: boolean) {
    const prevStatus = this.subscriptionStatus;
    const prevPermission = this.permissionStatus;
    this.allowed = allowed;
    this.emitPermissionUpdateIfChanged(prevPermission);
    this.emitSubscriptionUpdateIfChanged(prevStatus);
  }

  /** @internal */
  setSubscriptionError(error: SubscriptionError) {
    this.emit(TrackEvent.SubscriptionFailed, error);
  }

  /** @internal */
  updateInfo(info: TrackInfo) {
    super.updateInfo(info);
    const prevMetadataMuted = this.metadataMuted;
    this.metadataMuted = info.muted;
    if (this.track) {
      this.track.setMuted(info.muted);
    } else if (prevMetadataMuted !== info.muted) {
      this.emit(info.muted ? TrackEvent.Muted : TrackEvent.Unmuted);
    }
  }

  private emitSubscriptionUpdateIfChanged(previousStatus: TrackPublication.SubscriptionStatus) {
    const currentStatus = this.subscriptionStatus;
    if (previousStatus === currentStatus) {
      return;
    }
    this.emit(TrackEvent.SubscriptionStatusChanged, currentStatus, previousStatus);
  }

  private emitPermissionUpdateIfChanged(
    previousPermissionStatus: TrackPublication.PermissionStatus,
  ) {
    const currentPermissionStatus = this.permissionStatus;
    if (currentPermissionStatus !== previousPermissionStatus) {
      this.emit(
        TrackEvent.SubscriptionPermissionChanged,
        this.permissionStatus,
        previousPermissionStatus,
      );
    }
  }

  private isManualOperationAllowed(): boolean {
    if (this.kind === Track.Kind.Video && this.isAdaptiveStream) {
      this.log.warn(
        'adaptive stream is enabled, cannot change video track settings',
        this.logContext,
      );
      return false;
    }
    if (!this.isDesired) {
      this.log.warn('cannot update track settings when not subscribed', this.logContext);
      return false;
    }
    return true;
  }

  protected handleEnded = (track: RemoteTrack) => {
    this.setTrack(undefined);
    this.emit(TrackEvent.Ended, track);
  };

  protected get isAdaptiveStream(): boolean {
    return this.track instanceof RemoteVideoTrack && this.track.isAdaptiveStream;
  }

  protected handleVisibilityChange = (visible: boolean) => {
    this.log.debug(
      `adaptivestream video visibility ${this.trackSid}, visible=${visible}`,
      this.logContext,
    );
    this.disabled = !visible;
    this.emitTrackUpdate();
  };

  protected handleVideoDimensionsChange = (dimensions: Track.Dimensions) => {
    this.log.debug(
      `adaptivestream video dimensions ${dimensions.width}x${dimensions.height}`,
      this.logContext,
    );
    this.videoDimensions = dimensions;
    this.emitTrackUpdate();
  };

  /* @internal */
  emitTrackUpdate() {
    const settings: UpdateTrackSettings = new UpdateTrackSettings({
      trackSids: [this.trackSid],
      disabled: this.disabled,
      fps: this.fps,
    });
    if (this.videoDimensions) {
      settings.width = Math.ceil(this.videoDimensions.width);
      settings.height = Math.ceil(this.videoDimensions.height);
    } else if (this.currentVideoQuality !== undefined) {
      settings.quality = this.currentVideoQuality;
    } else {
      // defaults to high quality
      settings.quality = VideoQuality.HIGH;
    }

    this.emit(TrackEvent.UpdateSettings, settings);
  }
}
