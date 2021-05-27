import { TrackInfo } from '../../proto/livekit_models'
import {
  UpdateSubscription,
  UpdateTrackSettings,
  VideoQuality
} from '../../proto/livekit_rtc'
import { TrackEvent } from '../events'
import { RemoteAudioTrack } from './RemoteAudioTrack'
import { RemoteVideoTrack } from './RemoteVideoTrack'
import { Track } from './Track'
import { TrackPublication } from './TrackPublication'
import { RemoteTrack } from './types'

export class RemoteTrackPublication extends TrackPublication {
  track?: RemoteTrack;

  protected subscribe: boolean = false;
  protected disabled: boolean = false;
  protected videoQuality: VideoQuality = VideoQuality.HIGH;

  constructor(kind: Track.Kind, id: string, name: string) {
    super(kind, id, name);
  }

  get isSubscribed(): boolean {
    return !!this.track;
  }

  /**
   * Subscribe or unsubscribe to this remote track
   * @param subscribed true to subscribe to a track, false to unsubscribe
   */
  setSubscribed(subscribed: boolean) {
    this.subscribe = subscribed;

    const sub: UpdateSubscription = {
      trackSids: [this.trackSid],
      subscribe: this.subscribe,
      quality: this.videoQuality,
    };
    this.emit(TrackEvent.UpdateSubscription, sub);
  }

  /**
   * disable server from sending down data for this track. this is useful when
   * the participant is off screen, you may disable streaming down their video
   * to reduce bandwidth requirements
   * @param enabled
   */
  setEnabled(enabled: boolean) {
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
    this.videoQuality = quality;

    this.emitTrackUpdate();
  }

  /** @internal */
  updateInfo(info: TrackInfo) {
    super.updateInfo(info);
    this._isMuted = info.muted;
    if (
      this.track instanceof RemoteVideoTrack ||
      this.track instanceof RemoteAudioTrack
    ) {
      this.track.setMuted(info.muted);
    }
  }

  protected emitTrackUpdate() {
    const settings: UpdateTrackSettings = {
      trackSids: [this.trackSid],
      disabled: this.disabled,
      quality: this.videoQuality,
    };

    this.emit(TrackEvent.UpdateSettings, settings);
  }
}
