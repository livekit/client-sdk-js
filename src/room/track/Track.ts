import { EventEmitter } from 'events';
import { TrackSource, TrackType } from '../../proto/livekit_models';
import { TrackEvent } from '../events';

// keep old audio elements when detached, we would re-use them since on iOS
// Safari tracks which audio elements have been "blessed" by the user.
const recycledElements: Array<HTMLAudioElement> = [];

export class Track extends EventEmitter {
  kind: Track.Kind;

  mediaStreamTrack: MediaStreamTrack;

  attachedElements: HTMLMediaElement[] = [];

  isMuted: boolean = false;

  source: Track.Source;

  /**
   * sid is set after track is published to server, or if it's a remote track
   */
  sid?: Track.SID;

  protected constructor(mediaTrack: MediaStreamTrack, kind: Track.Kind) {
    super();
    this.kind = kind;
    this.mediaStreamTrack = mediaTrack;
    this.source = Track.Source.Unknown;
  }

  /**
   * creates a new HTMLAudioElement or HTMLVideoElement, attaches to it, and returns it
   */
  attach(): HTMLMediaElement;

  /**
   * attaches track to an existing HTMLAudioElement or HTMLVideoElement
   */
  attach(element: HTMLMediaElement): HTMLMediaElement;
  attach(element?: HTMLMediaElement): HTMLMediaElement {
    let elementType = 'audio';
    if (this.kind === Track.Kind.Video) {
      elementType = 'video';
    }
    if (!element) {
      if (elementType === 'audio') {
        recycledElements.forEach((e) => {
          if (e.parentElement === null && !element) {
            element = e;
          }
        });
        if (element) {
          // remove it from pool
          recycledElements.splice(recycledElements.indexOf(element), 1);
        }
      }
      if (!element) {
        element = <HTMLMediaElement>document.createElement(elementType);
      }
    }

    if (element instanceof HTMLVideoElement) {
      element.playsInline = true;
      element.autoplay = true;
    }

    // already attached
    if (this.attachedElements.includes(element)) {
      return element;
    }

    attachToElement(this.mediaStreamTrack, element);
    this.attachedElements.push(element);

    if (element instanceof HTMLAudioElement) {
      // manually play audio to detect audio playback status
      element.play()
        .then(() => {
          this.emit(TrackEvent.AudioPlaybackStarted);
        })
        .catch((e) => {
          this.emit(TrackEvent.AudioPlaybackFailed, e);
        });
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
    // detach from a single element
    if (element) {
      detachTrack(this.mediaStreamTrack, element);
      const idx = this.attachedElements.indexOf(element);
      if (idx >= 0) {
        this.attachedElements.splice(idx, 1);
        this.recycleElement(element);
      }
      return element;
    }

    const detached: HTMLMediaElement[] = [];
    this.attachedElements.forEach((elm) => {
      detachTrack(this.mediaStreamTrack, elm);
      detached.push(elm);
      this.recycleElement(elm);
    });

    // remove all tracks
    this.attachedElements = [];
    return detached;
  }

  stop() {
    this.mediaStreamTrack.stop();
  }

  protected enable() {
    this.mediaStreamTrack.enabled = true;
  }

  protected disable() {
    this.mediaStreamTrack.enabled = false;
  }

  private recycleElement(element: HTMLMediaElement) {
    if (element instanceof HTMLAudioElement) {
    // we only need to re-use a single element
      let shouldCache = true;
      element.pause();
      recycledElements.forEach((e) => {
        if (!e.parentElement) {
          shouldCache = false;
        }
      });
      if (shouldCache) {
        recycledElements.push(element);
      }
    }
  }
}

/** @internal */
export function attachToElement(track: MediaStreamTrack, element: HTMLMediaElement) {
  let mediaStream: MediaStream;
  if (element.srcObject instanceof MediaStream) {
    mediaStream = element.srcObject;
  } else {
    mediaStream = new MediaStream();
    element.srcObject = mediaStream;
  }

  // remove existing tracks of same type from stream
  let existingTracks: MediaStreamTrack[];
  if (track.kind === 'audio') {
    existingTracks = mediaStream.getAudioTracks();
  } else {
    existingTracks = mediaStream.getVideoTracks();
  }

  existingTracks.forEach((et) => {
    mediaStream.removeTrack(et);
  });

  mediaStream.addTrack(track);
}

/** @internal */
export function detachTrack(
  track: MediaStreamTrack,
  element: HTMLMediaElement,
) {
  if (element.srcObject instanceof MediaStream) {
    const mediaStream = element.srcObject;
    mediaStream.removeTrack(track);
    element.srcObject = null;
  }
}

export namespace Track {
  export enum Kind {
    Audio = 'audio',
    Video = 'video',
    Unknown = 'unknown',
  }
  export type SID = string;
  export enum Source {
    Camera = 'camera',
    Microphone = 'microphone',
    ScreenShare = 'screen_share',
    ScreenShareAudio = 'screen_share_audio',
    Unknown = 'unknown',
  }

  export interface Dimensions {
    width: number;
    height: number;
  }

  /** @internal */
  export function kindToProto(k: Kind): TrackType {
    switch (k) {
      case Kind.Audio:
        return TrackType.AUDIO;
      case Kind.Video:
        return TrackType.VIDEO;
      default:
        return TrackType.UNRECOGNIZED;
    }
  }

  /** @internal */
  export function kindFromProto(t: TrackType): Kind | undefined {
    switch (t) {
      case TrackType.AUDIO:
        return Kind.Audio;
      case TrackType.VIDEO:
        return Kind.Video;
      default:
        return Kind.Unknown;
    }
  }

  /** @internal */
  export function sourceToProto(s: Source): TrackSource {
    switch (s) {
      case Source.Camera:
        return TrackSource.CAMERA;
      case Source.Microphone:
        return TrackSource.MICROPHONE;
      case Source.ScreenShare:
        return TrackSource.SCREEN_SHARE;
      case Source.ScreenShareAudio:
        return TrackSource.SCREEN_SHARE_AUDIO;
      default:
        return TrackSource.UNRECOGNIZED;
    }
  }

  /** @internal */
  export function sourceFromProto(s: TrackSource): Source {
    switch (s) {
      case TrackSource.CAMERA:
        return Source.Camera;
      case TrackSource.MICROPHONE:
        return Source.Microphone;
      case TrackSource.SCREEN_SHARE:
        return Source.ScreenShare;
      case TrackSource.SCREEN_SHARE_AUDIO:
        return Source.ScreenShareAudio;
      default:
        return Source.Unknown;
    }
  }
}
