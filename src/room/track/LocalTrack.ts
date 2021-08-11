import log from 'loglevel';
import { TrackInvalidError } from '../errors';
import { TrackEvent } from '../events';
import { CreateLocalTracksOptions, VideoPresets } from './options';
import { attachToElement, detachTrack, Track } from './Track';

export default class LocalTrack extends Track {
  /** @internal */
  sender?: RTCRtpSender;

  protected constraints: MediaTrackConstraints;

  protected constructor(mediaTrack: MediaStreamTrack, kind: Track.Kind,
    name?: string, constraints?: MediaTrackConstraints) {
    super(mediaTrack, kind, name);
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

  static constraintsForOptions(options: CreateLocalTracksOptions):
  MediaStreamConstraints {
    const constraints: MediaStreamConstraints = {};

    // default video options
    const videoOptions: MediaTrackConstraints = {
      ...VideoPresets.qhd.resolution,
    };
    if (typeof options.video === 'object' && options.video) {
      Object.assign(videoOptions, options.video);
      if (options.video.resolution) {
        Object.assign(videoOptions, options.video.resolution);
      }
    }

    if (options.video === false) {
      constraints.video = false;
    } else {
    // use defaults
      constraints.video = videoOptions;
    }
    constraints.audio = options.audio;
    return constraints;
  }

  mute(): LocalTrack {
    this.setTrackMuted(true);
    return this;
  }

  unmute(): LocalTrack {
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

    // TODO: for safari, there is a bug that might cause this to be wonky
    // _workaroundWebKitBug1208516
    const mediaStream = await navigator.mediaDevices.getUserMedia(streamConstraints);
    const newTrack = mediaStream.getTracks()[0];
    log.info('re-acquired MediaStreamTrack');

    // detach and reattach
    this.mediaStreamTrack.stop();
    this.attachedElements.forEach((el) => {
      detachTrack(this.mediaStreamTrack, el);
    });

    newTrack.enabled = this.mediaStreamTrack.enabled;
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
}
