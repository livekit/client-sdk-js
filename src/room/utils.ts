import UAParser from 'ua-parser-js';
import { ClientInfo, ClientInfo_SDK } from '../proto/livekit_models';
import { protocolVersion, version } from '../version';
import type LocalAudioTrack from './track/LocalAudioTrack';
import type RemoteAudioTrack from './track/RemoteAudioTrack';
import { getNewAudioContext } from './track/utils';

const separator = '|';

export function unpackStreamId(packed: string): string[] {
  const parts = packed.split(separator);
  if (parts.length > 1) {
    return [parts[0], packed.substr(parts[0].length + 1)];
  }
  return [packed, ''];
}

export async function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/** @internal */
export function supportsTransceiver() {
  return 'addTransceiver' in RTCPeerConnection.prototype;
}

/** @internal */
export function supportsAddTrack() {
  return 'addTrack' in RTCPeerConnection.prototype;
}

export function supportsAdaptiveStream() {
  return typeof ResizeObserver !== undefined && typeof IntersectionObserver !== undefined;
}

export function supportsDynacast() {
  return supportsTransceiver();
}

export function supportsAV1(): boolean {
  const capabilities = RTCRtpReceiver.getCapabilities('video');
  let hasAV1 = false;
  let hasDDExt = false;
  if (capabilities) {
    for (const codec of capabilities.codecs) {
      if (codec.mimeType === 'video/AV1') {
        hasAV1 = true;
        break;
      }
    }
    for (const ext of capabilities.headerExtensions) {
      if (
        ext.uri ===
        'https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension'
      ) {
        hasDDExt = true;
        break;
      }
    }
  }
  return hasAV1 && hasDDExt;
}

export function supportsSetSinkId(elm?: HTMLMediaElement): boolean {
  if (!document) {
    return false;
  }
  if (!elm) {
    elm = document.createElement('audio');
  }
  return 'setSinkId' in elm;
}

const setCodecPreferencesVersions: { [key: string]: string } = {
  Chrome: '100',
  Chromium: '100',
  Safari: '15',
  Firefox: '100',
  Edge: '100',
  Brave: '1.40',
};

export function supportsSetCodecPreferences(transceiver: RTCRtpTransceiver): boolean {
  if (!isWeb()) {
    return false;
  }
  if (!('setCodecPreferences' in transceiver)) {
    return false;
  }
  const uap = UAParser();
  if (!uap.browser.name || !uap.browser.version) {
    // version is required
    return false;
  }
  const v = setCodecPreferencesVersions[uap.browser.name];
  if (v) {
    return compareVersions(uap.browser.version, v) >= 0;
  }
  return false;
}

export function isBrowserSupported() {
  return supportsTransceiver() || supportsAddTrack();
}

export function isFireFox(): boolean {
  if (!isWeb()) return false;
  return navigator.userAgent.indexOf('Firefox') !== -1;
}

export function isSafari(): boolean {
  if (!isWeb()) return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function isMobile(): boolean {
  if (!isWeb()) return false;
  return /Tablet|iPad|Mobile|Android|BlackBerry/.test(navigator.userAgent);
}

export function isWeb(): boolean {
  return typeof document !== 'undefined';
}

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.');
  const parts2 = v2.split('.');
  const k = Math.min(v1.length, v2.length);
  for (let i = 0; i < k; ++i) {
    const p1 = parseInt(parts1[i], 10);
    const p2 = parseInt(parts2[i], 10);
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return parts1.length == parts2.length ? 0 : parts1.length < parts2.length ? -1 : 1;
}

function roDispatchCallback(entries: ResizeObserverEntry[]) {
  for (const entry of entries) {
    (entry.target as ObservableMediaElement).handleResize(entry);
  }
}

function ioDispatchCallback(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    (entry.target as ObservableMediaElement).handleVisibilityChanged(entry);
  }
}

let resizeObserver: ResizeObserver | null = null;
export const getResizeObserver = () => {
  if (!resizeObserver) resizeObserver = new ResizeObserver(roDispatchCallback);
  return resizeObserver;
};

let intersectionObserver: IntersectionObserver | null = null;
export const getIntersectionObserver = () => {
  if (!intersectionObserver)
    intersectionObserver = new IntersectionObserver(ioDispatchCallback, {
      root: document,
      rootMargin: '0px',
    });
  return intersectionObserver;
};

export interface ObservableMediaElement extends HTMLMediaElement {
  handleResize: (entry: ResizeObserverEntry) => void;
  handleVisibilityChanged: (entry: IntersectionObserverEntry) => void;
}

export function getClientInfo(): ClientInfo {
  const info = ClientInfo.fromPartial({
    sdk: ClientInfo_SDK.JS,
    protocol: protocolVersion,
    version,
  });
  return info;
}

let emptyVideoStreamTrack: MediaStreamTrack | undefined;

export function getEmptyVideoStreamTrack() {
  if (!emptyVideoStreamTrack) {
    emptyVideoStreamTrack = createDummyVideoStreamTrack();
  }
  return emptyVideoStreamTrack;
}

export function createDummyVideoStreamTrack(
  width: number = 16,
  height: number = 16,
  enabled: boolean = false,
  paintContent: boolean = false,
) {
  const canvas = document.createElement('canvas');
  // the canvas size is set to 16 by default, because electron apps seem to fail with smaller values
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx?.fillRect(0, 0, canvas.width, canvas.height);
  if (paintContent && ctx) {
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 50, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = 'grey';
    ctx.fill();
  }
  // @ts-ignore
  const dummyStream = canvas.captureStream();
  const [dummyTrack] = dummyStream.getTracks();
  if (!dummyTrack) {
    throw Error('Could not get empty media stream video track');
  }
  dummyTrack.enabled = enabled;

  return dummyTrack;
}

let emptyAudioStreamTrack: MediaStreamTrack | undefined;

export function getEmptyAudioStreamTrack() {
  if (!emptyAudioStreamTrack) {
    // implementation adapted from https://blog.mozilla.org/webrtc/warm-up-with-replacetrack/
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = ctx.createMediaStreamDestination();
    oscillator.connect(dst);
    oscillator.start();
    [emptyAudioStreamTrack] = dst.stream.getAudioTracks();
    if (!emptyAudioStreamTrack) {
      throw Error('Could not get empty media stream audio track');
    }
    emptyAudioStreamTrack.enabled = false;
  }
  return emptyAudioStreamTrack;
}

export class Future<T> {
  promise: Promise<T>;

  resolve?: (arg: T) => void;

  reject?: (e: any) => void;

  onFinally?: () => void;

  constructor(
    futureBase?: (resolve: (arg: T) => void, reject: (e: any) => void) => void,
    onFinally?: () => void,
  ) {
    this.onFinally = onFinally;
    this.promise = new Promise<T>(async (resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      if (futureBase) {
        await futureBase(resolve, reject);
      }
    }).finally(() => this.onFinally?.());
  }
}

export type AudioAnalyserOptions = {
  /**
   * If set to true, the analyser will use a cloned version of the underlying mediastreamtrack, which won't be impacted by muting the track.
   * Useful for local tracks when implementing things like "seems like you're muted, but trying to speak".
   * Defaults to false
   */
  cloneTrack?: boolean;
  /**
   * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize
   */
  fftSize?: number;
  /**
   * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/smoothingTimeConstant
   */
  smoothingTimeConstant?: number;
  /**
   * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/minDecibels
   */
  minDecibels?: number;
  /**
   * see https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/maxDecibels
   */
  maxDecibels?: number;
};

/**
 * Creates and returns an analyser web audio node that is attached to the provided track.
 * Additionally returns a convenience method `calculateVolume` to perform instant volume readings on that track.
 * Call the returned `cleanup` function to close the audioContext that has been created for the instance of this helper
 */
export function createAudioAnalyser(
  track: LocalAudioTrack | RemoteAudioTrack,
  options?: AudioAnalyserOptions,
) {
  const opts = {
    cloneTrack: false,
    fftSize: 2048,
    smoothingTimeConstant: 0.8,
    minDecibels: -100,
    maxDecibels: -80,
    ...options,
  };
  const audioContext = getNewAudioContext();

  if (!audioContext) {
    throw new Error('Audio Context not supported on this browser');
  }
  const streamTrack = opts.cloneTrack ? track.mediaStreamTrack.clone() : track.mediaStreamTrack;
  const mediaStreamSource = audioContext.createMediaStreamSource(new MediaStream([streamTrack]));
  const analyser = audioContext.createAnalyser();
  analyser.minDecibels = opts.minDecibels;
  analyser.maxDecibels = opts.maxDecibels;
  analyser.fftSize = opts.fftSize;
  analyser.smoothingTimeConstant = opts.smoothingTimeConstant;

  mediaStreamSource.connect(analyser);
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  /**
   * Calculates the current volume of the track in the range from 0 to 1
   */
  const calculateVolume = () => {
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (const amplitude of dataArray) {
      sum += Math.pow(amplitude / 255, 2);
    }
    const volume = Math.sqrt(sum / dataArray.length);
    return volume;
  };

  const cleanup = () => {
    audioContext.close();
    if (opts.cloneTrack) {
      streamTrack.stop();
    }
  };

  return { calculateVolume, analyser, cleanup };
}

export class Mutex {
  private _locking: Promise<void>;

  private _locks: number;

  constructor() {
    this._locking = Promise.resolve();
    this._locks = 0;
  }

  isLocked() {
    return this._locks > 0;
  }

  lock() {
    this._locks += 1;

    let unlockNext: () => void;

    const willLock = new Promise<void>(
      (resolve) =>
        (unlockNext = () => {
          this._locks -= 1;
          resolve();
        }),
    );

    const willUnlock = this._locking.then(() => unlockNext);

    this._locking = this._locking.then(() => willLock);

    return willUnlock;
  }
}
