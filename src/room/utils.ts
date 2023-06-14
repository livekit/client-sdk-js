import { ClientInfo, ClientInfo_SDK } from '../proto/livekit_models';
import { getBrowser } from '../utils/browserParser';
import type { DetectableBrowser } from '../utils/browserParser';
import { protocolVersion, version } from '../version';
import type LocalAudioTrack from './track/LocalAudioTrack';
import type RemoteAudioTrack from './track/RemoteAudioTrack';
import { getNewAudioContext } from './track/utils';
import type { LiveKitReactNativeInfo } from './types';

const separator = '|';
export const ddExtensionURI =
  'https://aomediacodec.github.io/av1-rtp-spec/#dependency-descriptor-rtp-header-extension';

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
  if (!('getCapabilities' in RTCRtpSender)) {
    return false;
  }
  const capabilities = RTCRtpSender.getCapabilities('video');
  let hasAV1 = false;
  if (capabilities) {
    for (const codec of capabilities.codecs) {
      if (codec.mimeType === 'video/AV1') {
        hasAV1 = true;
        break;
      }
    }
  }
  return hasAV1;
}

export function supportsVP9(): boolean {
  if (!('getCapabilities' in RTCRtpSender)) {
    // technically speaking FireFox supports VP9, but SVC publishing is broken
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1633876
    return false;
  }
  const capabilities = RTCRtpSender.getCapabilities('video');
  let hasVP9 = false;
  if (capabilities) {
    for (const codec of capabilities.codecs) {
      if (codec.mimeType === 'video/VP9') {
        hasVP9 = true;
        break;
      }
    }
  }
  return hasVP9;
}

export function isSVCCodec(codec?: string): boolean {
  return codec === 'av1' || codec === 'vp9';
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

const setCodecPreferencesVersions: Record<DetectableBrowser, string> = {
  Chrome: '100',
  Safari: '15',
  Firefox: '100',
};

export function supportsSetCodecPreferences(transceiver: RTCRtpTransceiver): boolean {
  if (!isWeb()) {
    return false;
  }
  if (!('setCodecPreferences' in transceiver)) {
    return false;
  }
  const browser = getBrowser();
  if (!browser?.name || !browser.version) {
    // version is required
    return false;
  }
  const v = setCodecPreferencesVersions[browser.name];
  if (v) {
    return compareVersions(browser.version, v) >= 0;
  }
  return false;
}

export function isBrowserSupported() {
  return supportsTransceiver() || supportsAddTrack();
}

export function isFireFox(): boolean {
  return getBrowser()?.name === 'Firefox';
}

export function isChromiumBased(): boolean {
  return getBrowser()?.name === 'Chrome';
}

export function isSafari(): boolean {
  return getBrowser()?.name === 'Safari';
}

export function isMobile(): boolean {
  if (!isWeb()) return false;
  return /Tablet|iPad|Mobile|Android|BlackBerry/.test(navigator.userAgent);
}

export function isWeb(): boolean {
  return typeof document !== 'undefined';
}

export function isReactNative(): boolean {
  // navigator.product is deprecated on browsers, but will be set appropriately for react-native.
  return navigator.product == 'ReactNative';
}

export function isCloud(serverUrl: URL) {
  return serverUrl.hostname.endsWith('.livekit.cloud');
}

function getLKReactNativeInfo(): LiveKitReactNativeInfo | undefined {
  // global defined only for ReactNative.
  // @ts-ignore
  if (global && global.LiveKitReactNativeGlobal) {
    // @ts-ignore
    return global.LiveKitReactNativeGlobal as LiveKitReactNativeInfo;
  }

  return undefined;
}

export function getReactNativeOs(): string | undefined {
  if (!isReactNative()) {
    return undefined;
  }

  let info = getLKReactNativeInfo();
  if (info) {
    return info.platform;
  }

  return undefined;
}

export function getDevicePixelRatio(): number {
  if (isWeb()) {
    return window.devicePixelRatio;
  }

  if (isReactNative()) {
    let info = getLKReactNativeInfo();
    if (info) {
      return info.devicePixelRatio;
    }
  }

  return 1;
}

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.');
  const parts2 = v2.split('.');
  const k = Math.min(parts1.length, parts2.length);
  for (let i = 0; i < k; ++i) {
    const p1 = parseInt(parts1[i], 10);
    const p2 = parseInt(parts2[i], 10);
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
    if (i === k - 1 && p1 === p2) return 0;
  }
  if (v1 === '' && v2 !== '') {
    return -1;
  } else if (v2 === '') {
    return 1;
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
  if (!intersectionObserver) {
    intersectionObserver = new IntersectionObserver(ioDispatchCallback, {
      root: null,
      rootMargin: '0px',
    });
  }
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

  if (isReactNative()) {
    info.os = getReactNativeOs() ?? '';
  }
  return info;
}

let emptyVideoStreamTrack: MediaStreamTrack | undefined;

export function getEmptyVideoStreamTrack() {
  if (!emptyVideoStreamTrack) {
    emptyVideoStreamTrack = createDummyVideoStreamTrack();
  }
  return emptyVideoStreamTrack.clone();
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
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, 0);
    const dst = ctx.createMediaStreamDestination();
    oscillator.connect(gain);
    gain.connect(dst);
    oscillator.start();
    [emptyAudioStreamTrack] = dst.stream.getAudioTracks();
    if (!emptyAudioStreamTrack) {
      throw Error('Could not get empty media stream audio track');
    }
    emptyAudioStreamTrack.enabled = false;
  }
  return emptyAudioStreamTrack.clone();
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

export function unwrapConstraint(constraint: ConstrainDOMString): string {
  if (typeof constraint === 'string') {
    return constraint;
  }

  if (Array.isArray(constraint)) {
    return constraint[0];
  }
  if (constraint.exact) {
    if (Array.isArray(constraint.exact)) {
      return constraint.exact[0];
    }
    return constraint.exact;
  }
  if (constraint.ideal) {
    if (Array.isArray(constraint.ideal)) {
      return constraint.ideal[0];
    }
    return constraint.ideal;
  }
  throw Error('could not unwrap constraint');
}
