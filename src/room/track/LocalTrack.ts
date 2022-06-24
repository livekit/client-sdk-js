import log from '../../logger';
import DeviceManager from '../DeviceManager';
import { TrackInvalidError } from '../errors';
import { TrackEvent } from '../events';
import { VideoCodec } from './options';
import { getEmptyAudioStreamTrack, getEmptyVideoStreamTrack, isMobile } from '../utils';
import { attachToElement, detachTrack, Track } from './Track';

export default class LocalTrack extends Track {
  /** @internal */
  sender?: RTCRtpSender;

  /** @internal */
  codec?: VideoCodec;

  protected constraints: MediaTrackConstraints;

  protected wasMuted: boolean;

  protected reacquireTrack: boolean;

  protected providedByUser: boolean;

  protected constructor(
    mediaTrack: MediaStreamTrack,
    kind: Track.Kind,
    constraints?: MediaTrackConstraints,
    userProvidedTrack = false,
  ) {
    super(mediaTrack, kind);
    this._mediaStreamTrack.addEventListener('ended', this.handleEnded);
    this.constraints = constraints ?? mediaTrack.getConstraints();
    this.reacquireTrack = false;
    this.wasMuted = false;
    this.providedByUser = userProvidedTrack;
  }

  get id(): string {
    return this._mediaStreamTrack.id;
  }

  get dimensions(): Track.Dimensions | undefined {
    if (this.kind !== Track.Kind.Video) {
      return undefined;
    }

    const { width, height } = this._mediaStreamTrack.getSettings();
    if (width && height) {
      return {
        width,
        height,
      };
    }
    return undefined;
  }

  private _isUpstreamPaused: boolean = false;

  get isUpstreamPaused() {
    return this._isUpstreamPaused;
  }

  get isUserProvided() {
    return this.providedByUser;
  }

  /**
   * @returns DeviceID of the device that is currently being used for this track
   */
  async getDeviceId(): Promise<string | undefined> {
    // screen share doesn't have a usable device id
    if (this.source === Track.Source.ScreenShare) {
      return;
    }
    const { deviceId, groupId } = this._mediaStreamTrack.getSettings();
    const kind = this.kind === Track.Kind.Audio ? 'audioinput' : 'videoinput';

    return DeviceManager.getInstance().normalizeDeviceId(kind, deviceId, groupId);
  }

  async mute(): Promise<LocalTrack> {
    this.setTrackMuted(true);
    return this;
  }

  async unmute(): Promise<LocalTrack> {
    this.setTrackMuted(false);
    return this;
  }

  async replaceTrack(track: MediaStreamTrack, userProvidedTrack = true): Promise<LocalTrack> {
    if (!this.sender) {
      throw new TrackInvalidError('unable to replace an unpublished track');
    }

    // detach
    this.attachedElements.forEach((el) => {
      detachTrack(this._mediaStreamTrack, el);
    });
    this._mediaStreamTrack.removeEventListener('ended', this.handleEnded);
    // on Safari, the old audio track must be stopped before attempting to acquire
    // the new track, otherwise the new track will stop with
    // 'A MediaStreamTrack ended due to a capture failure`
    this._mediaStreamTrack.stop();

    track.addEventListener('ended', this.handleEnded);
    log.debug('replace MediaStreamTrack');

    if (this.sender) {
      await this.sender.replaceTrack(track);
    }
    this._mediaStreamTrack = track;

    this.attachedElements.forEach((el) => {
      attachToElement(track, el);
    });

    this.mediaStream = new MediaStream([track]);
    this.providedByUser = userProvidedTrack;
    return this;
  }

  protected async restart(constraints?: MediaTrackConstraints): Promise<LocalTrack> {
    if (!constraints) {
      constraints = this.constraints;
    }
    log.debug('restarting track with constraints', constraints);

    const streamConstraints: MediaStreamConstraints = {
      audio: false,
      video: false,
    };

    if (this.kind === Track.Kind.Video) {
      streamConstraints.video = constraints;
    } else {
      streamConstraints.audio = constraints;
    }

    // detach
    this.attachedElements.forEach((el) => {
      detachTrack(this._mediaStreamTrack, el);
    });
    this._mediaStreamTrack.removeEventListener('ended', this.handleEnded);
    // on Safari, the old audio track must be stopped before attempting to acquire
    // the new track, otherwise the new track will stop with
    // 'A MediaStreamTrack ended due to a capture failure`
    this._mediaStreamTrack.stop();

    // create new track and attach
    const mediaStream = await navigator.mediaDevices.getUserMedia(streamConstraints);
    const newTrack = mediaStream.getTracks()[0];
    newTrack.addEventListener('ended', this.handleEnded);
    log.debug('re-acquired MediaStreamTrack');

    if (this.sender) {
      // Track can be restarted after it's unpublished
      await this.sender.replaceTrack(newTrack);
    }

    this._mediaStreamTrack = newTrack;

    this.attachedElements.forEach((el) => {
      attachToElement(newTrack, el);
    });

    this.mediaStream = mediaStream;
    this.constraints = constraints;
    return this;
  }

  protected setTrackMuted(muted: boolean) {
    if (this.isMuted === muted) {
      return;
    }

    this.isMuted = muted;
    this._mediaStreamTrack.enabled = !muted;
    this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
  }

  protected get needsReAcquisition(): boolean {
    return (
      this._mediaStreamTrack.readyState !== 'live' ||
      this._mediaStreamTrack.muted ||
      !this._mediaStreamTrack.enabled ||
      this.reacquireTrack
    );
  }

  protected async handleAppVisibilityChanged() {
    await super.handleAppVisibilityChanged();
    if (!isMobile()) return;
    log.debug(`visibility changed, is in Background: ${this.isInBackground}`);

    if (!this.isInBackground && this.needsReAcquisition && !this.isUserProvided) {
      log.debug(`track needs to be reaquired, restarting ${this.source}`);
      await this.restart();
      this.reacquireTrack = false;
      // Restore muted state if had to be restarted
      this.setTrackMuted(this.wasMuted);
    }

    // store muted state each time app goes to background
    if (this.isInBackground) {
      this.wasMuted = this.isMuted;
    }
  }

  private handleEnded = () => {
    if (this.isInBackground) {
      this.reacquireTrack = true;
    }
    this.emit(TrackEvent.Ended, this);
  };

  async pauseUpstream() {
    if (this._isUpstreamPaused === true) {
      return;
    }
    if (!this.sender) {
      log.warn('unable to pause upstream for an unpublished track');
      return;
    }
    this._isUpstreamPaused = true;
    this.emit(TrackEvent.UpstreamPaused, this);
    const emptyTrack =
      this.kind === Track.Kind.Audio ? getEmptyAudioStreamTrack() : getEmptyVideoStreamTrack();
    await this.sender.replaceTrack(emptyTrack);
  }

  async resumeUpstream() {
    if (this._isUpstreamPaused === false) {
      return;
    }
    if (!this.sender) {
      log.warn('unable to resume upstream for an unpublished track');
      return;
    }
    this._isUpstreamPaused = false;
    this.emit(TrackEvent.UpstreamResumed, this);

    await this.sender.replaceTrack(this._mediaStreamTrack);
  }
}
