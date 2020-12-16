import { EventEmitter } from 'events';
import { TrackInfo_Type } from '../proto/model';

export type LocalTrack = LocalAudioTrack | LocalVideoTrack;
export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack;

export class Track extends EventEmitter {
  kind: Track.Kind;
  name: string;

  protected constructor(kind: Track.Kind, name?: string) {
    super();
    this.kind = kind;
    this.name = name || '';
  }
}

export namespace Track {
  export enum Kind {
    Audio = 'audio',
    Video = 'video',
    Data = 'data',
  }
  export type SID = string;
  export type Priority = 'low' | 'standard' | 'high';

  export function kindToProto(k: Kind): TrackInfo_Type {
    switch (k) {
      case Kind.Audio:
        return TrackInfo_Type.AUDIO;
      case Kind.Video:
        return TrackInfo_Type.VIDEO;
      case Kind.Data:
        return TrackInfo_Type.DATA;
    }
  }
}

export class AudioTrack extends Track {
  isStarted: boolean = false;
  isEnabled: boolean = false;
  mediaStreamTrack: MediaStreamTrack;
  attachedElements: HTMLMediaElement[] = [];

  protected constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(Track.Kind.Audio, name);
    this.mediaStreamTrack = mediaTrack;
  }

  /**
   * Attach to an existing HTMLAudioElement or HTMLVideoElement
   * @param element if not passed in, creates a new HTMLAudioElement
   */
  attach(): HTMLMediaElement;
  attach(element?: HTMLMediaElement): HTMLMediaElement {
    return attachTrack(
      this.mediaStreamTrack,
      this.attachedElements,
      'audio',
      element
    );
  }

  detach(): HTMLMediaElement[];
  detach(element?: HTMLMediaElement): HTMLMediaElement | HTMLMediaElement[] {
    return detachTracks(this.mediaStreamTrack, this.attachedElements, element);
  }

  stop() {
    this.mediaStreamTrack.stop();
  }
}

export class RemoteAudioTrack extends AudioTrack {
  // whether the remote audio track is switched off
  isSwitchedOff: boolean = false;
  sid: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, sid: string) {
    super(mediaTrack);
    this.sid = sid;
  }
}

export class LocalAudioTrack extends AudioTrack {
  id: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(mediaTrack, name);
    this.id = mediaTrack.id;
  }
}

export class VideoTrack extends Track {
  isStarted: boolean = false;
  isEnabled: boolean = false;
  mediaStreamTrack: MediaStreamTrack;
  dimensions: VideoTrack.Dimensions = {};
  attachedElements: HTMLVideoElement[] = [];

  protected constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(Track.Kind.Video, name || mediaTrack.label);
    this.mediaStreamTrack = mediaTrack;
    const { width, height } = mediaTrack.getSettings();
    if (width && height) {
      this.dimensions.width = width;
      this.dimensions.height = height;
    }
  }

  attach(): HTMLVideoElement;
  attach(element?: HTMLVideoElement): HTMLVideoElement {
    return <HTMLVideoElement>(
      attachTrack(
        this.mediaStreamTrack,
        this.attachedElements,
        'video',
        element
      )
    );
  }

  detach(): HTMLMediaElement[];
  detach(element?: HTMLMediaElement): HTMLMediaElement | HTMLMediaElement[] {
    return detachTracks(this.mediaStreamTrack, this.attachedElements, element);
  }

  stop() {
    this.mediaStreamTrack.stop();
  }
}

export namespace VideoTrack {
  export interface Dimensions {
    width?: number;
    height?: number;
  }
}

export class LocalVideoTrack extends VideoTrack {
  id: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(mediaTrack, name);
    this.id = mediaTrack.id;
  }
}

export class RemoteVideoTrack extends VideoTrack {
  sid: Track.SID;

  constructor(mediaTrack: MediaStreamTrack, sid: string) {
    super(mediaTrack);
    // override id to parsed ID
    this.sid = sid;
  }
}

// attachment/detachment helpers
function attachTrack(
  track: MediaStreamTrack,
  attachedElements: HTMLMediaElement[],
  elementType: 'video' | 'audio',
  element?: HTMLMediaElement
): HTMLMediaElement {
  if (!element) {
    element = document.createElement(elementType);
    element.autoplay = true;
  }
  let mediaStream: MediaStream;

  // already attached
  if (attachedElements.includes(element)) {
    return element;
  }

  if (element.srcObject instanceof MediaStream) {
    mediaStream = element.srcObject;
  } else {
    mediaStream = new MediaStream();
    element.srcObject = mediaStream;
  }

  mediaStream.addTrack(track);
  attachedElements.push(element);

  return element;
}

function detachTracks(
  track: MediaStreamTrack,
  attachedElements: HTMLMediaElement[],
  element?: HTMLMediaElement
): HTMLMediaElement | HTMLMediaElement[] {
  if (element) {
    detachTrack(track, element);
    const idx = attachedElements.indexOf(element);
    if (idx >= 0) {
      attachedElements.splice(idx, 1);
    }
    return element;
  } else {
    const detached: HTMLMediaElement[] = [];
    attachedElements.forEach((element) => {
      detachTrack(track, element);
      detached.push(element);
    });

    // remove all tracks
    attachedElements.splice(0, attachedElements.length);
    return detached;
  }
}

function detachTrack(track: MediaStreamTrack, element: HTMLMediaElement) {
  if (element.srcObject instanceof MediaStream) {
    const mediaStream = element.srcObject;
    mediaStream.removeTrack(track);
  }
}
