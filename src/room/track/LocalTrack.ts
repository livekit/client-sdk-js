import log from '../../logger';
import DeviceManager from '../DeviceManager';
import { TrackInvalidError } from '../errors';
import { TrackEvent } from '../events';
import { attachToElement, detachTrack, Track } from './Track';

export default class LocalTrack extends Track {
  /** @internal */
  sender?: RTCRtpSender;

  protected constraints: MediaTrackConstraints;

  protected _currentBitrate: number = 0;

  protected constructor(
    mediaTrack: MediaStreamTrack, kind: Track.Kind, constraints?: MediaTrackConstraints,
  ) {
    super(mediaTrack, kind);
    this.mediaStreamTrack.addEventListener('ended', this.handleEnded);
    this.constraints = constraints ?? mediaTrack.getConstraints();
  }

  get id(): string {
    return this.mediaStreamTrack.id;
  }

  get dimensions(): Track.Dimensions | undefined {
    if (this.kind !== Track.Kind.Video) {
      return undefined;
    }

    const { width, height } = this.mediaStreamTrack.getSettings();
    if (width && height) {
      return {
        width,
        height,
      };
    }
    return undefined;
  }

  /** current send bits per second */
  get currentBitrate(): number {
    return this._currentBitrate;
  }

  /**
   * @returns DeviceID of the device that is currently being used for this track
   */
  async getDeviceId(): Promise<string | undefined> {
    // screen share doesn't have a usable device id
    if (this.source === Track.Source.ScreenShare) {
      return;
    }
    const { deviceId, groupId } = this.mediaStreamTrack.getSettings();
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

  protected async restart(constraints?: MediaTrackConstraints): Promise<LocalTrack> {
    if (!this.sender) {
      throw new TrackInvalidError('unable to restart an unpublished track');
    }
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
      detachTrack(this.mediaStreamTrack, el);
    });
    this.mediaStreamTrack.removeEventListener('ended', this.handleEnded);
    // on Safari, the old audio track must be stopped before attempting to acquire
    // the new track, otherwise the new track will stop with
    // 'A MediaStreamTrack ended due to a capture failure`
    this.mediaStreamTrack.stop();

    // create new track and attach
    const mediaStream = await navigator.mediaDevices.getUserMedia(streamConstraints);
    const newTrack = mediaStream.getTracks()[0];
    newTrack.addEventListener('ended', this.handleEnded);
    log.debug('re-acquired MediaStreamTrack');

    await this.sender.replaceTrack(newTrack);
    this.mediaStreamTrack = newTrack;

    this.attachedElements.forEach((el) => {
      attachToElement(newTrack, el);
    });

    this.constraints = constraints;
    return this;
  }

  protected setTrackMuted(muted: boolean) {
    if (this.isMuted === muted) {
      return;
    }

    this.isMuted = muted;
    this.mediaStreamTrack.enabled = !muted;
    this.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, this);
  }

  public dispose() {
    this.mediaStreamTrack?.removeEventListener('ended', this.handleEnded);
  }

  handleEnded = () => {
    this.emit(TrackEvent.Ended);
  };
}
