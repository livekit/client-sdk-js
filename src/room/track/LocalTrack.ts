import log from 'loglevel';
import { TrackInvalidError } from '../errors';
import { TrackEvent } from '../events';
import { attachToElement, Track } from './Track';

export default class LocalTrack extends Track {
  protected constraints: MediaTrackConstraints;

  /** @internal */
  sender?: RTCRtpSender;

  constructor(
    mediaTrack: MediaStreamTrack,
    kind: Track.Kind,
    name?: string,
    constraints?: MediaTrackConstraints,
  ) {
    super(mediaTrack, kind, name);
    this.constraints = constraints || {};
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

  mute(): LocalTrack {
    this.setTrackMuted(true);
    return this;
  }

  unmute(): LocalTrack {
    this.setTrackMuted(false);
    return this;
  }

  async restart(constraints?: MediaTrackConstraints): Promise<LocalTrack> {
    if (!this.sender) {
      throw new TrackInvalidError('unable to restart an unpublished track');
    }
    if (!constraints) {
      constraints = this.constraints;
    }

    // copy existing elements and detach
    this.mediaStreamTrack.stop();

    const streamConstraints: MediaStreamConstraints = {
      audio: false,
      video: false,
    };

    if (this.kind === Track.Kind.Video) {
      streamConstraints.video = constraints;
    } else {
      streamConstraints.audio = constraints;
    }

    // TODO: for safari, there is a bug that might cause this to be wonky
    // _workaroundWebKitBug1208516
    const mediaStream = await navigator.mediaDevices.getUserMedia(streamConstraints);
    const newTrack = mediaStream.getTracks()[0];
    log.info('re-acquired MediaStreamTrack');
    this.constraints = constraints;

    newTrack.enabled = this.mediaStreamTrack.enabled;
    await this.sender.replaceTrack(newTrack);
    this.mediaStreamTrack = newTrack;

    this.attachedElements.forEach((el) => {
      attachToElement(newTrack, el);
    });
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
}
