// import EventEmitter from 'eventemitter3';
import { Track, version as lkVersion } from '../src/index';

export const syncDelay = 50;
export const shortTimeout = 1 * 1000;
export const mediumTimeout = 5 * 1000;
export const longTimeout = 10 * 1000;
export const veryLongTimeout = 20 * 1000;
export const migrationTimeout = 20 * 1000;
export const extraLongTimeout = 60 * 1000;

export interface SubscribedVideoTrackStats {
  framesReceived?: number;
  framesDecoded?: number;
  framesDropped?: number;
  frameWidth?: number;
  frameHeight?: number;
  framesPerSecond?: number;
  pliCount?: number;
  firCount?: number;
  nackCount?: number;
  decoderImplementation?: string;
  packetsReceived?: number;
  packetsLost?: number;
  bytesReceived?: number;
  ssrc?: number;
  mimeType?: string;
}

export interface SubscribedAudioTrackStats {
  packetsReceived?: number;
  packetsLost?: number;
  totalSamplesReceived?: number;
  concealedSamples?: number;
  silentConcealedSamples?: number;
  concealmentEvents?: number;
  totalSamplesDuration?: number;
  ssrc?: number;
}

export interface PublishedVideoTrackStats {
  framesSent?: number;
  packetsSent?: number;
  ssrc?: number;
  mimeType?: string;
  bytesSent?: number;
}

export function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}

export class SkippedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SkippedError';
  }
}

type AsyncWaitFunc = () => Promise<string | undefined>;
type WaitFunc = () => string | undefined;

export async function waitUntil(
  func: WaitFunc | AsyncWaitFunc,
  timeout: number = mediumTimeout,
  checkInterval: number = syncDelay,
): Promise<void> {
  const endsAt = Date.now() + timeout;
  let message: string | undefined;
  while (Date.now() < endsAt) {
    await sleep(checkInterval);
    const result = func();
    if (result === undefined) {
      // successful
      return;
    }
    if (typeof result === 'string') {
      message = result;
    } else {
      message = await result;
      if (message === undefined) {
        return;
      }
    }
  }

  throw new Error(message);
}

export async function failWhen(
  func: WaitFunc | AsyncWaitFunc,
  timeout: number = mediumTimeout,
  checkInterval: number = syncDelay,
): Promise<void> {
  const endsAt = Date.now() + timeout;
  let message: string | undefined;
  while (Date.now() < endsAt) {
    const result = func();
    if (typeof result === 'string') {
      throw new Error(result);
    } else if (typeof result !== 'undefined') {
      message = await result;
      if (message !== undefined) {
        throw new Error(message);
      }
    }

    await sleep(checkInterval);
  }
}

export async function asyncForeach<T>(
  array: Array<T>,
  callback: (arg0: T, index: number, array: Array<T>) => any,
) {
  await Promise.all(array.map(callback));
}

export async function expectError<T>(promise: Promise<T>, message?: string) {
  try {
    await promise;
  } catch {
    return true;
  }
  throw Error(message ?? 'Expected error, but none was raised');
}

export interface TestUtils {
  forceElementsInViewport(enable: boolean): void;

  getVideoStreamTrack(
    index: number,
    totalAgentCount?: number,
    dimensions?: { width: number; height: number },
  ): Promise<{
    videoStreamTrack: MediaStreamTrack;
    cleanup: () => void;
  }>;

  matchVideoStreamPattern(index: number, track: Track, totalAgentCount?: number): Promise<boolean>;

  getAudioStreamTrack(frequency: number): Promise<MediaStreamTrack>;

  matchAudioStreamFrequency(
    expectedFrequency: number,
    mediaStreamTrack: MediaStreamTrack,
  ): Promise<boolean>;
}

export function isWeb(): boolean {
  return typeof document !== 'undefined';
}

export function isFireFox(): boolean {
  if (!isWeb()) return false;
  return navigator.userAgent.indexOf('Firefox') !== -1;
}

export function isSafari(): boolean {
  if (!isWeb()) return false;
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

export function getErrorMessage(e: any): string {
  let message: string = '';
  if (e instanceof Error) {
    message = e.message;
  } else if (typeof e === 'string') {
    message = e;
  } else if (e instanceof PromiseRejectionEvent) {
    message = e.reason.message;
  } else {
    message = `error: ${e}`;
  }
  return message;
}

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.');
  const parts2 = v2.split('.');
  const k = Math.min(parts1.length, parts2.length);
  for (let i = 0; i < k; i += 1) {
    const p1 = parseInt(parts1[i], 10);
    const p2 = parseInt(parts2[i], 10);
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
    if (i === k - 1 && p1 === p2) return 0;
  }
  if (v1 === '' && v2 !== '') {
    return -1;
  }
  if (v2 === '') {
    return 1;
  }
  if (parts1.length === parts2.length) {
    return 0;
  }
  return parts1.length < parts2.length ? -1 : 1;
}

export function isClientOlderThan(version: string) {
  return compareVersions(lkVersion, version) < 0;
}
