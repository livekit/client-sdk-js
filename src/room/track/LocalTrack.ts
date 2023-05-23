import log from '../../logger';
import DeviceManager from '../DeviceManager';
import { TrackInvalidError } from '../errors';
import { TrackEvent } from '../events';
import {
  Mutex,
  getEmptyAudioStreamTrack,
  getEmptyVideoStreamTrack,
  isMobile,
  sleep,
} from '../utils';
import { Track, attachToElement, detachTrack } from './Track';
import type { VideoCodec } from './options';
import type { ProcessorOptions, TrackProcessor } from './processor/types';

const defaultDimensionsTimeout = 1000;

export default abstract class LocalTrack extends Track {
  /** @internal */
  sender?: RTCRtpSender;

  /** @internal */
  codec?: VideoCodec;

  protected constraints: MediaTrackConstraints;

  protected reacquireTrack: boolean;

  protected providedByUser: boolean;

  protected muteLock: Mutex;

  protected pauseUpstreamLock: Mutex;

  protected processorElement?: HTMLMediaElement;

  protected processor?: TrackProcessor<ProcessorOptions>;

  protected isSettingUpProcessor: boolean = false;

  /**
   *
   * @param mediaTrack
   * @param kind
   * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
   * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
   */
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
    this.providedByUser = userProvidedTrack;
    this.muteLock = new Mutex();
    this.pauseUpstreamLock = new Mutex();
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

  get mediaStreamTrack() {
    return this.processor?.processedTrack || this._mediaStreamTrack;
  }

  async waitForDimensions(timeout = defaultDimensionsTimeout): Promise<Track.Dimensions> {
    if (this.kind === Track.Kind.Audio) {
      throw new Error('cannot get dimensions for audio tracks');
    }

    const started = Date.now();
    while (Date.now() - started < timeout) {
      const dims = this.dimensions;
      if (dims) {
        return dims;
      }
      await sleep(50);
    }
    throw new TrackInvalidError('unable to get track dimensions after timeout');
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
    if (!this.providedByUser) {
      this._mediaStreamTrack.stop();
    }

    track.addEventListener('ended', this.handleEnded);
    log.debug('replace MediaStreamTrack');

    if (this.sender) {
      await this.sender.replaceTrack(track);
    }
    this._mediaStreamTrack = track;

    // sync muted state with the enabled state of the newly provided track
    this._mediaStreamTrack.enabled = !this.isMuted;

    await this.resumeUpstream();

    this.attachedElements.forEach((el) => {
      attachToElement(track, el);
    });

    this.mediaStream = new MediaStream([track]);
    this.providedByUser = userProvidedTrack;
    if (this.processor) {
      await this.stopProcessor();
    }
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
      detachTrack(this.mediaStreamTrack, el);
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

    await this.resumeUpstream();

    this.mediaStream = mediaStream;
    this.constraints = constraints;
    if (this.processor) {
      const processor = this.processor;
      await this.setProcessor(processor);
    } else {
      this.attachedElements.forEach((el) => {
        attachToElement(this._mediaStreamTrack, el);
      });
    }
    this.emit(TrackEvent.Restarted, this);
    return this;
  }

  protected setTrackMuted(muted: boolean) {
    log.debug(`setting ${this.kind} track ${muted ? 'muted' : 'unmuted'}`);

    if (this.isMuted === muted && this._mediaStreamTrack.enabled !== muted) {
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

    if (!this.isInBackground && this.needsReAcquisition && !this.isUserProvided && !this.isMuted) {
      log.debug(`track needs to be reaquired, restarting ${this.source}`);
      await this.restart();
      this.reacquireTrack = false;
    }
  }

  private handleEnded = () => {
    if (this.isInBackground) {
      this.reacquireTrack = true;
    }
    this.emit(TrackEvent.Ended, this);
  };

  stop() {
    super.stop();
    this.processor?.destroy();
    this.processor = undefined;
  }

  async pauseUpstream() {
    const unlock = await this.pauseUpstreamLock.lock();
    try {
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
    } finally {
      unlock();
    }
  }

  async resumeUpstream() {
    const unlock = await this.pauseUpstreamLock.lock();
    try {
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
    } finally {
      unlock();
    }
  }

  async setProcessor(
    processor: TrackProcessor<ProcessorOptions>,
    showProcessedStreamLocally = true,
  ) {
    if (this.isSettingUpProcessor) {
      log.warn('already trying to set up a processor');
      return;
    }
    log.debug('setting up processor');
    this.isSettingUpProcessor = true;
    if (this.processor) {
      await this.stopProcessor();
    }
    if (this.kind === 'unknown') {
      throw TypeError('cannot set processor on track of unknown kind');
    }
    this.processorElement = this.processorElement ?? document.createElement(this.kind);
    this.processorElement.muted = true;

    attachToElement(this._mediaStreamTrack, this.processorElement);
    this.processorElement.play().catch((e) => log.error(e));

    const processorOptions = {
      track: this._mediaStreamTrack,
      element: this.processorElement,
    };

    await processor.init(processorOptions);
    this.processor = processor;
    if (this.processor.processedTrack) {
      for (const el of this.attachedElements) {
        if (el !== this.processorElement && showProcessedStreamLocally) {
          detachTrack(this._mediaStreamTrack, el);
          attachToElement(this.processor.processedTrack, el);
        }
      }

      await this.sender?.replaceTrack(this.processor.processedTrack);
      console.log('processed track', this.processor.processedTrack);
    }
    this.isSettingUpProcessor = false;
  }

  async stopProcessor() {
    if (!this.processor) return;

    log.debug('stopping processor');
    this.processor.processedTrack?.stop();
    await this.processor.destroy();
    this.processor = undefined;
    this.processorElement?.remove();
    this.processorElement = undefined;

    await this.restart();
  }

  protected abstract monitorSender(): void;
}
