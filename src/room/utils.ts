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

let emptyMediaStreamTrack: MediaStreamTrack | undefined;

export function getEmptyMediaStreamTrack() {
  if (!emptyMediaStreamTrack) {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const emptyStream = canvas.captureStream();
    [emptyMediaStreamTrack] = emptyStream.getTracks();
    emptyMediaStreamTrack.enabled = false;
  }
  return emptyMediaStreamTrack;
}
