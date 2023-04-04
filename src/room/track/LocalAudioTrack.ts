import log from '../../logger';
import { TrackEvent } from '../events';
import { AudioSenderStats, computeBitrate, monitorFrequency } from '../stats';
import { isWeb, supportsSetSinkId } from '../utils';
import LocalTrack from './LocalTrack';
import type { AudioCaptureOptions } from './options';
import { Track } from './Track';
import { constraintsForOptions, detectSilence } from './utils';

export default class LocalAudioTrack extends LocalTrack {
  /** @internal */
  stopOnMute: boolean = false;

  private prevStats?: AudioSenderStats;

  private elementVolume: number | undefined;

  private audioContext?: AudioContext;

  private gainNode?: GainNode;

  private sourceNode?: MediaStreamAudioSourceNode;

  private webAudioPluginNodes: AudioNode[];

  private sinkId?: string;

  /**
   *
   * @param mediaTrack
   * @param constraints MediaTrackConstraints that are being used when restarting or reacquiring tracks
   * @param userProvidedTrack Signals to the SDK whether or not the mediaTrack should be managed (i.e. released and reacquired) internally by the SDK
   */
  constructor(
    mediaTrack: MediaStreamTrack,
    constraints?: MediaTrackConstraints,
    userProvidedTrack = true,
  ) {
    super(mediaTrack, Track.Kind.Audio, constraints, userProvidedTrack);
    this.checkForSilence();
    this.webAudioPluginNodes = [];
  }

  /**
   * sets the volume for all attached audio elements
   * note: only sets the volume locally
   */
  setVolume(volume: number) {
    for (const el of this.attachedElements) {
      if (this.audioContext) {
        this.gainNode?.gain.setTargetAtTime(volume, 0, 0.1);
      } else {
        el.volume = volume;
      }
    }
    this.elementVolume = volume;
  }

  /**
   * calls setSinkId on all attached elements, if supported
   * @param deviceId audio output device
   */
  async setSinkId(deviceId: string) {
    this.sinkId = deviceId;
    await Promise.all(
      this.attachedElements.map((elm) => {
        if (!supportsSetSinkId(elm)) {
          return;
        }
        /* @ts-ignore */
        return elm.setSinkId(deviceId) as Promise<void>;
      }),
    );
  }

  attach(): HTMLMediaElement;
  attach(element: HTMLMediaElement): HTMLMediaElement;
  attach(element?: HTMLMediaElement): HTMLMediaElement {
    const needsNewWebAudioConnection = this.attachedElements.length === 0;
    if (!element) {
      element = super.attach();
    } else {
      super.attach(element);
    }
    if (this.elementVolume) {
      element.volume = this.elementVolume;
    }
    if (this.sinkId && supportsSetSinkId(element)) {
      /* @ts-ignore */
      element.setSinkId(this.sinkId);
    }
    if (this.audioContext && needsNewWebAudioConnection) {
      log.debug('using audio context mapping');
      this.connectWebAudio(this.audioContext, element);
      element.volume = 0;
      element.muted = true;
    }
    return element;
  }

  /**
   * Detaches from all attached elements
   */
  detach(): HTMLMediaElement[];

  /**
   * Detach from a single element
   * @param element
   */
  detach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement | HTMLMediaElement[] {
    let detached: HTMLMediaElement | HTMLMediaElement[];
    if (!element) {
      detached = super.detach();
      this.disconnectWebAudio();
    } else {
      detached = super.detach(element);
      // if there are still any attached elements after detaching, connect webaudio to the first element that's left
      // disconnect webaudio otherwise
      if (this.audioContext) {
        if (this.attachedElements.length > 0) {
          this.connectWebAudio(this.audioContext, this.attachedElements[0]);
        } else {
          this.disconnectWebAudio();
        }
      }
    }
    return detached;
  }

  /**
   * setting an audio context on the track will force it into web audio mode as soon as there are elements attached to it
   * @experimental
   */
  setAudioContext(audioContext: AudioContext | undefined) {
    this.audioContext = audioContext;
    if (audioContext && this.attachedElements.length > 0) {
      this.connectWebAudio(audioContext, this.attachedElements[0]);
    } else if (!audioContext) {
      this.disconnectWebAudio();
    }
  }

  /**
   * @internal
   * @experimental
   * @param {AudioNode[]} nodes - An array of WebAudio nodes. These nodes should not be connected to each other when passed, as the sdk will take care of connecting them in the order of the array.
   */
  setWebAudioPlugins(nodes: AudioNode[]) {
    this.webAudioPluginNodes = nodes;
    if (this.attachedElements.length > 0 && this.audioContext) {
      this.connectWebAudio(this.audioContext, this.attachedElements[0]);
    }
  }

  private connectWebAudio(context: AudioContext, element: HTMLMediaElement) {
    this.disconnectWebAudio();
    // @ts-ignore attached elements always have a srcObject set
    this.sourceNode = context.createMediaStreamSource(element.srcObject);
    let lastNode: AudioNode = this.sourceNode;
    this.webAudioPluginNodes.forEach((node) => {
      lastNode.connect(node);
      lastNode = node;
    });
    this.gainNode = context.createGain();
    lastNode.connect(this.gainNode);
    this.gainNode.connect(context.destination);

    if (this.elementVolume) {
      this.gainNode.gain.setTargetAtTime(this.elementVolume, 0, 0.1);
    }

    // try to resume the context if it isn't running already
    if (context.state !== 'running') {
      context
        .resume()
        .then(() => {
          if (context.state !== 'running') {
            this.emit(
              TrackEvent.AudioPlaybackFailed,
              new Error("Audio Context couldn't be started automatically"),
            );
          }
        })
        .catch((e) => {
          this.emit(TrackEvent.AudioPlaybackFailed, e);
        });
    }
  }

  private disconnectWebAudio() {
    this.gainNode?.disconnect();
    this.sourceNode?.disconnect();
    this.gainNode = undefined;
    this.sourceNode = undefined;
  }

  async setDeviceId(deviceId: ConstrainDOMString) {
    if (this.constraints.deviceId === deviceId) {
      return;
    }
    this.constraints.deviceId = deviceId;
    if (!this.isMuted) {
      await this.restartTrack();
    }
  }

  async mute(): Promise<LocalAudioTrack> {
    const unlock = await this.muteLock.lock();
    try {
      // disabled special handling as it will cause BT headsets to switch communication modes
      if (this.source === Track.Source.Microphone && this.stopOnMute && !this.isUserProvided) {
        log.debug('stopping mic track');
        // also stop the track, so that microphone indicator is turned off
        this._mediaStreamTrack.stop();
      }
      await super.mute();
      return this;
    } finally {
      unlock();
    }
  }

  async unmute(): Promise<LocalAudioTrack> {
    const unlock = await this.muteLock.lock();
    try {
      if (
        this.source === Track.Source.Microphone &&
        (this.stopOnMute || this._mediaStreamTrack.readyState === 'ended') &&
        !this.isUserProvided
      ) {
        log.debug('reacquiring mic track');
        await this.restartTrack();
      }
      await super.unmute();

      return this;
    } finally {
      unlock();
    }
  }

  async restartTrack(options?: AudioCaptureOptions) {
    let constraints: MediaTrackConstraints | undefined;
    if (options) {
      const streamConstraints = constraintsForOptions({ audio: options });
      if (typeof streamConstraints.audio !== 'boolean') {
        constraints = streamConstraints.audio;
      }
    }
    await this.restart(constraints);
  }

  protected async restart(constraints?: MediaTrackConstraints): Promise<LocalTrack> {
    const track = await super.restart(constraints);
    this.checkForSilence();
    return track;
  }

  /* @internal */
  startMonitor() {
    if (!isWeb()) {
      return;
    }
    if (this.monitorInterval) {
      return;
    }
    this.monitorInterval = setInterval(() => {
      this.monitorSender();
    }, monitorFrequency);
  }

  protected monitorSender = async () => {
    if (!this.sender) {
      this._currentBitrate = 0;
      return;
    }

    let stats: AudioSenderStats | undefined;
    try {
      stats = await this.getSenderStats();
    } catch (e) {
      log.error('could not get audio sender stats', { error: e });
      return;
    }

    if (stats && this.prevStats) {
      this._currentBitrate = computeBitrate(stats, this.prevStats);
    }

    this.prevStats = stats;
  };

  async getSenderStats(): Promise<AudioSenderStats | undefined> {
    if (!this.sender?.getStats) {
      return undefined;
    }

    const stats = await this.sender.getStats();
    let audioStats: AudioSenderStats | undefined;
    stats.forEach((v) => {
      if (v.type === 'outbound-rtp') {
        audioStats = {
          type: 'audio',
          streamId: v.id,
          packetsSent: v.packetsSent,
          packetsLost: v.packetsLost,
          bytesSent: v.bytesSent,
          timestamp: v.timestamp,
          roundTripTime: v.roundTripTime,
          jitter: v.jitter,
        };
      }
    });

    return audioStats;
  }

  async checkForSilence() {
    const trackIsSilent = await detectSilence(this);
    if (trackIsSilent) {
      if (!this.isMuted) {
        log.warn('silence detected on local audio track');
      }
      this.emit(TrackEvent.AudioSilenceDetected);
    }
    return trackIsSilent;
  }
}
