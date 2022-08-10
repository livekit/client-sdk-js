import { ClientInfo, ClientInfo_SDK } from '../proto/livekit_models';
import { protocolVersion, version } from '../version';

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
    const canvas = document.createElement('canvas');
    // the canvas size is set to 16, because electron apps seem to fail with smaller values
    canvas.width = 16;
    canvas.height = 16;
    canvas.getContext('2d')?.fillRect(0, 0, canvas.width, canvas.height);
    // @ts-ignore
    const emptyStream = canvas.captureStream();
    [emptyVideoStreamTrack] = emptyStream.getTracks();
    if (!emptyVideoStreamTrack) {
      throw Error('Could not get empty media stream video track');
    }
    emptyVideoStreamTrack.enabled = false;
  }
  return emptyVideoStreamTrack;
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

  resolve!: (arg: T) => void;

  reject!: (e: any) => void;

  constructor(promise?: Promise<T>) {
    this.promise =
      promise ??
      new Promise<T>((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
  }
}
