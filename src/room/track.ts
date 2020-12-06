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
  attach(element?: HTMLMediaElement): HTMLMediaElement {
    if (!element) {
      element = new HTMLAudioElement();
    }
    let mediaStream: MediaStream;

    // already attached
    if (this.attachedElements.includes(element)) {
      return element;
    }

    if (element.srcObject instanceof MediaStream) {
      mediaStream = element.srcObject;
    } else {
      mediaStream = new MediaStream();
      element.srcObject = mediaStream;
    }

    mediaStream.addTrack(this.mediaStreamTrack);
    this.attachedElements.push(element);

    return element;
  }

  detach(element: HTMLMediaElement): HTMLMediaElement {
    return element;
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

  attach(element?: HTMLVideoElement): HTMLVideoElement {
    if (!element) {
      element = new HTMLVideoElement();
    }
    let mediaStream: MediaStream;

    // already attached
    if (this.attachedElements.includes(element)) {
      return element;
    }

    if (element.srcObject instanceof MediaStream) {
      mediaStream = element.srcObject;
    } else {
      mediaStream = new MediaStream();
      element.srcObject = mediaStream;
    }

    mediaStream.addTrack(this.mediaStreamTrack);
    this.attachedElements.push(element);

    return element;
  }

  detach(element: HTMLMediaElement): HTMLMediaElement {
    return element;
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
