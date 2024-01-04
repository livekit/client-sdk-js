import { debounce } from 'ts-debounce';
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

  protected processor?: TrackProcessor<this['kind']>;

  protected processorLock: Mutex;

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

  private async setMediaStreamTrack(newTrack: MediaStreamTrack, force?: boolean) {
    if (newTrack === this._mediaStreamTrack && !force) {
      return;
    }
    if (this._mediaStreamTrack) {
      // detach
      this.attachedElements.forEach((el) => {
        detachTrack(this._mediaStreamTrack, el);
      });
      this.debouncedTrackMuteHandler.cancel('new-track');
      this._mediaStreamTrack.removeEventListener('ended', this.handleEnded);
      this._mediaStreamTrack.removeEventListener('mute', this.handleTrackMuteEvent);
      this._mediaStreamTrack.removeEventListener('unmute', this.handleTrackUnmuteEvent);
    }

    this.mediaStream = new MediaStream([newTrack]);
    if (newTrack) {
      newTrack.addEventListener('ended', this.handleEnded);
      // when underlying track emits mute, it indicates that the device is unable
      // to produce media. In this case we'll need to signal with remote that
      // the track is "muted"
      // note this is different from LocalTrack.mute because we do not want to
      // touch MediaStreamTrack.enabled
      newTrack.addEventListener('mute', this.handleTrackMuteEvent);
      newTrack.addEventListener('unmute', this.handleTrackUnmuteEvent);
      this._constraints = newTrack.getConstraints();
    }
    let processedTrack: MediaStreamTrack | undefined;
    if (this.processor && newTrack && this.processorElement) {
      log.debug('restarting processor');
      if (this.kind === 'unknown') {
        throw TypeError('cannot set processor on track of unknown kind');
      }

      attachToElement(newTrack, this.processorElement);
      // ensure the processorElement itself stays muted
      this.processorElement.muted = true;
      await this.processor.restart({
        track: newTrack,
        kind: this.kind,
        element: this.processorElement,
      });
      processedTrack = this.processor.processedTrack;
    }
    if (this.sender) {
      await this.sender.replaceTrack(processedTrack ?? newTrack);
    }
    // if `newTrack` is different from the existing track, stop the
    // older track just before replacing it
    if (!this.providedByUser && this._mediaStreamTrack !== newTrack) {
      this._mediaStreamTrack.stop();
    }
    this._mediaStreamTrack = newTrack;
    if (newTrack) {
      // sync muted state with the enabled state of the newly provided track
      this._mediaStreamTrack.enabled = !this.isMuted;
      // when a valid track is replace, we'd want to start producing
      await this.resumeUpstream();
      this.attachedElements.forEach((el) => {
        attachToElement(processedTrack ?? newTrack, el);
      });
    }
  }

  async waitForDimensions(timeout = defaultDimensionsTimeout): Promise<Track.Dimensions> {
    if (this.kind === Track.Kind.Audio) {
      throw new Error('cannot get dimensions for audio tracks');
    }

    if (getBrowser()?.os === 'iOS') {
      // browsers report wrong initial resolution on iOS.
      // when slightly delaying the call to .getSettings(), the correct resolution is being reported
      await sleep(10);
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

  protected async restart(constraints?: MediaTrackConstraints): Promise<LocalTrack> {
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

    await this.setMediaStreamTrack(newTrack);
    this._constraints = constraints;

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
      log.debug(`track needs to be reacquired, restarting ${this.source}`);
      await this.restart();
      this.reacquireTrack = false;
    }
  }

  private handleTrackMuteEvent = () =>
    this.debouncedTrackMuteHandler().catch(() =>
      log.debug('track mute bounce got cancelled by an unmute event'),
    );

  private debouncedTrackMuteHandler = debounce(async () => {
    await this.pauseUpstream();
  }, 5000);

  private handleTrackUnmuteEvent = async () => {
    this.debouncedTrackMuteHandler.cancel('unmute');
    await this.resumeUpstream();
  };

  private handleEnded = () => {
    if (this.isInBackground) {
      this.reacquireTrack = true;
    }
    this._mediaStreamTrack.removeEventListener('mute', this.handleTrackMuteEvent);
    this._mediaStreamTrack.removeEventListener('unmute', this.handleTrackUnmuteEvent);
    this.emit(TrackEvent.Ended, this);
  };

  stop() {
    super.stop();

    this._mediaStreamTrack.removeEventListener('ended', this.handleEnded);
    this._mediaStreamTrack.removeEventListener('mute', this.handleTrackMuteEvent);
    this._mediaStreamTrack.removeEventListener('unmute', this.handleTrackUnmuteEvent);
    this.processor?.destroy();
    this.processor = undefined;
  }

  /**
   * pauses publishing to the server without disabling the local MediaStreamTrack
   * this is used to display a user's own video locally while pausing publishing to
   * the server.
   * this API is unsupported on Safari < 12 due to a bug
   **/
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
      const browser = getBrowser();
      if (browser?.name === 'Safari' && compareVersions(browser.version, '12.0') < 0) {
        // https://bugs.webkit.org/show_bug.cgi?id=184911
        throw new DeviceUnsupportedError('pauseUpstream is not supported on Safari < 12.');
      }
      await this.sender.replaceTrack(null);
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

      // this operation is noop if mediastreamtrack is already being sent
      await this.sender.replaceTrack(this._mediaStreamTrack);
    } finally {
      unlock();
    }
  }

  /**
   * Gets the RTCStatsReport for the LocalTrack's underlying RTCRtpSender
   * See https://developer.mozilla.org/en-US/docs/Web/API/RTCStatsReport
   *
   * @returns Promise<RTCStatsReport> | undefined
   */
  async getRTCStatsReport(): Promise<RTCStatsReport | undefined> {
    if (!this.sender?.getStats) {
      return;
    }
    const statsReport = await this.sender.getStats();
    return statsReport;
  }

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
  async setProcessor(processor: TrackProcessor<this['kind']>, showProcessedStreamLocally = true) {
    const unlock = await this.processorLock.lock();
    try {
      log.debug('setting up processor');
      if (this.processor) {
        await this.stopProcessor();
      }
      if (this.kind === 'unknown') {
        throw TypeError('cannot set processor on track of unknown kind');
      }
      this.processorElement = this.processorElement ?? document.createElement(this.kind);

      attachToElement(this._mediaStreamTrack, this.processorElement);
      this.processorElement.muted = true;

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
        await this.sender?.replaceTrack(this.processor.processedTrack);
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
