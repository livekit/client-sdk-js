import log from '../../logger';
import { getBrowser } from '../../utils/browserParser';
import DeviceManager from '../DeviceManager';
import { DeviceUnsupportedError, TrackInvalidError } from '../errors';
import { TrackEvent } from '../events';
import { Mutex, compareVersions, isMobile, sleep } from '../utils';
import { Track, attachToElement, detachTrack } from './Track';
import type { VideoCodec } from './options';
import type { TrackProcessor } from './processor/types';

const defaultDimensionsTimeout = 1000;

export default abstract class LocalTrack extends Track {
  /** @internal */
  sender?: RTCRtpSender;

  /** @internal */
  codec?: VideoCodec;

  get constraints() {
    return this._constraints;
  }

  protected _constraints: MediaTrackConstraints;

  protected reacquireTrack: boolean;

  protected providedByUser: boolean;

  protected muteLock: Mutex;

  protected pauseUpstreamLock: Mutex;

  protected processorElement?: HTMLMediaElement;

  protected processor?: TrackProcessor<typeof this.kind>;

  protected processorLock: Mutex;

  protected resumeUpstreamWithProcessedTrack = false;

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
    this.reacquireTrack = false;
    this.providedByUser = userProvidedTrack;
    this.muteLock = new Mutex();
    this.pauseUpstreamLock = new Mutex();
    this.processorLock = new Mutex();
    this.setMediaStreamTrack(mediaTrack, true);

    // added to satisfy TS compiler, constraints are synced with MediaStreamTrack
    this._constraints = mediaTrack.getConstraints();
    if (constraints) {
      this._constraints = constraints;
    }
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
    return this.processor?.processedTrack ?? this._mediaStreamTrack;
  }

  private async setMediaStreamTrack(newTrack: MediaStreamTrack, force?: boolean, replace = true) {
    if (newTrack === this._mediaStreamTrack && !force) {
      return;
    }
    if (this._mediaStreamTrack) {
      // detach
      this.attachedElements.forEach((el) => {
        detachTrack(this._mediaStreamTrack, el);
      });
      this._mediaStreamTrack.removeEventListener('ended', this.handleEnded);
      this._mediaStreamTrack.removeEventListener('mute', this.pauseUpstream);
      this._mediaStreamTrack.removeEventListener('unmute', this.resumeUpstream);
      if (!this.providedByUser && this._mediaStreamTrack !== newTrack) {
        this._mediaStreamTrack.stop();
      }
    }

    this.mediaStream = new MediaStream([newTrack]);
    if (newTrack) {
      newTrack.addEventListener('ended', this.handleEnded);
      // when underlying track emits mute, it indicates that the device is unable
      // to produce media. In this case we'll need to signal with remote that
      // the track is "muted"
      // note this is different from LocalTrack.mute because we do not want to
      // touch MediaStreamTrack.enabled
      newTrack.addEventListener('mute', this.pauseUpstream);
      newTrack.addEventListener('unmute', this.resumeUpstream);
      this._constraints = newTrack.getConstraints();
    }
    if (this.sender && replace) {
      await this.sender.replaceTrack(newTrack);
    }
    this._mediaStreamTrack = newTrack;
    if (newTrack) {
      // sync muted state with the enabled state of the newly provided track
      this._mediaStreamTrack.enabled = !this.isMuted;
      if (replace) {
        // when a valid track is replace, we'd want to start producing
        await this.resumeUpstream();
        this.attachedElements.forEach((el) => {
          attachToElement(newTrack, el);
        });
      }
    }
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

    log.debug('replace MediaStreamTrack');
    await this.setMediaStreamTrack(track);
    // this must be synced *after* setting mediaStreamTrack above, since it relies
    // on the previous state in order to cleanup
    this.providedByUser = userProvidedTrack;

    if (this.processor) {
      await this.stopProcessor();
    }
    return this;
  }

  protected async restart(
    constraints?: MediaTrackConstraints,
    processor?: TrackProcessor<typeof this.kind>,
  ): Promise<LocalTrack> {
    if (!constraints) {
      constraints = this._constraints;
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

    // these steps are duplicated from setMediaStreamTrack because we must stop
    // the previous tracks before new tracks can be acquired
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

    if (!processor) {
      processor = this.processor;
    }
    if (processor) {
      log.debug('restarting track with processor', processor);
    }

    await this.setMediaStreamTrack(newTrack, false, !processor);

    this._constraints = constraints;

    if (processor) {
      await this.setProcessor(processor, true, false, false);
      if (processor.processedTrack) {
        await this.sender?.replaceTrack(processor.processedTrack);
      }
      this.resumeUpstreamWithProcessedTrack = true;
      await this.resumeUpstream();
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
    this._mediaStreamTrack.removeEventListener('mute', this.pauseUpstream);
    this._mediaStreamTrack.removeEventListener('unmute', this.resumeUpstream);
    this.emit(TrackEvent.Ended, this);
  };

  stop() {
    super.stop();

    this._mediaStreamTrack.removeEventListener('ended', this.handleEnded);
    this._mediaStreamTrack.removeEventListener('mute', this.pauseUpstream);
    this._mediaStreamTrack.removeEventListener('unmute', this.resumeUpstream);
    this.processor?.destroy();
    this.processor = undefined;
  }

  /**
   * pauses publishing to the server without disabling the local MediaStreamTrack
   * this is used to display a user's own video locally while pausing publishing to
   * the server.
   * this API is unsupported on Safari < 12 due to a bug
   **/
  pauseUpstream = async () => {
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
      const browser = getBrowser();
      if (browser?.name === 'Safari' && compareVersions(browser.version, '12.0') < 0) {
        // https://bugs.webkit.org/show_bug.cgi?id=184911
        throw new DeviceUnsupportedError('pauseUpstream is not supported on Safari < 12.');
      }
      await this.sender.replaceTrack(null);
    } finally {
      unlock();
    }
  };

  resumeUpstream = async () => {
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

      const track = this.resumeUpstreamWithProcessedTrack
        ? this.processor?.processedTrack
        : this._mediaStreamTrack;
      this.resumeUpstreamWithProcessedTrack = false;
      if (!track) {
        log.warn('unable to resume upstream with no track');
        return;
      }
      // this operation is noop if mediastreamtrack is already being sent
      await this.sender.replaceTrack(track);
    } finally {
      unlock();
    }
  };

  /**
   * Sets a processor on this track.
   * See https://github.com/livekit/track-processors-js for example usage
   *
   * @experimental
   *
   * @param processor
   * @param showProcessedStreamLocally
   * @returns
   */
  async setProcessor(
    processor: TrackProcessor<typeof this.kind>,
    showProcessedStreamLocally = true,
    restart = true,
    replace = true,
  ) {
    const unlock = await this.processorLock.lock();
    try {
      log.debug('setting up processor');
      if (this.processor) {
        await this.stopProcessor(restart);
      }
      if (this.kind === 'unknown') {
        throw TypeError('cannot set processor on track of unknown kind');
      }
      this.processorElement = this.processorElement ?? document.createElement(this.kind);
      this.processorElement.muted = true;

      attachToElement(this._mediaStreamTrack, this.processorElement);
      this.processorElement
        .play()
        .catch((error) => log.error('failed to play processor element', { error }));

      const processorOptions = {
        kind: this.kind,
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
        if (replace) {
          await this.sender?.replaceTrack(this.processor.processedTrack);
        }
      }
    } finally {
      unlock();
    }
  }

  getProcessor() {
    return this.processor;
  }

  /**
   * Stops the track processor
   * See https://github.com/livekit/track-processors-js for example usage
   *
   * @experimental
   * @returns
   */
  async stopProcessor(restart = true) {
    if (!this.processor) return;

    log.debug('stopping processor');
    this.processor.processedTrack?.stop();
    await this.processor.destroy();
    this.processor = undefined;
    this.processorElement?.remove();
    this.processorElement = undefined;
    if (restart) {
      await this.restart();
    }
  }

  protected abstract monitorSender(): void;
}
