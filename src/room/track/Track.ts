import { EventEmitter } from 'events';
import { TrackType } from '../../proto/livekit_models';

export class Track extends EventEmitter {
  kind: Track.Kind;

  name: string;

  mediaStreamTrack: MediaStreamTrack;

  attachedElements: HTMLMediaElement[] = [];

  isMuted: boolean = false;

  /**
   * sid is set after track is published to server, or if it's a remote track
   */
  sid?: Track.SID;

  protected constructor(mediaTrack: MediaStreamTrack, kind: Track.Kind, name?: string) {
    super();
    this.kind = kind;
    this.mediaStreamTrack = mediaTrack;
    this.name = name || '';
  }

  attach(): HTMLMediaElement;
  attach(element: HTMLMediaElement): HTMLMediaElement;
  attach(element?: HTMLMediaElement): HTMLMediaElement {
    let elementType = 'audio';
    if (this.kind === Track.Kind.Video) {
      elementType = 'video';
    }
    if (!element) {
      element = <HTMLMediaElement>document.createElement(elementType);
      element.autoplay = true;
      if (element instanceof HTMLVideoElement) {
        (<HTMLVideoElement>element).playsInline = true;
      }
    } else {
      if (element instanceof HTMLVideoElement) {
        (<HTMLVideoElement>element).playsInline = true;
      }
      element.autoplay = true;
    }

    // already attached
    if (this.attachedElements.includes(element)) {
      return element;
    }

    attachToElement(this.mediaStreamTrack, element);
    this.attachedElements.push(element);

    return element;
  }

  detach(): HTMLMediaElement[];
  detach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element?: HTMLMediaElement): HTMLMediaElement | HTMLMediaElement[] {
    // detach from a single element
    if (element) {
      detachTrack(this.mediaStreamTrack, element);
      const idx = this.attachedElements.indexOf(element);
      if (idx >= 0) {
        this.attachedElements.splice(idx, 1);
      }
      return element;
    }
    const detached: HTMLMediaElement[] = [];
    this.attachedElements.forEach((elm) => {
      detachTrack(this.mediaStreamTrack, elm);
      detached.push(elm);
    });

    // remove all tracks
    this.attachedElements = [];
    return detached;
  }

  stop() {
    this.mediaStreamTrack.stop();
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
function detachTrack(
  track: MediaStreamTrack,
  element: HTMLMediaElement,
) {
  if (element.srcObject instanceof MediaStream) {
    const mediaStream = element.srcObject;
    mediaStream.removeTrack(track);
  }
}

export namespace Track {
  export enum Kind {
    Audio = 'audio',
    Video = 'video',
    Unknown = 'unknown',
  }
  export type SID = string;
  export type Priority = 'low' | 'standard' | 'high';

  export interface Dimension {
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
}
