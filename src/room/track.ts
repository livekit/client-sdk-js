import { EventEmitter } from 'events';

export type LocalTrack = LocalAudioTrack | LocalVideoTrack;

export class Track extends EventEmitter {
  kind: Track.Kind;
  id: Track.ID;
  name: string;

  protected constructor(kind: Track.Kind, id: Track.ID, name?: string) {
    super();
    this.kind = kind;
    this.id = id;
    this.name = name || id;
  }
}

export namespace Track {
  export type Kind = 'audio' | 'video' | 'data';
  export type ID = string;
}

export class AudioTrack extends Track {
  isStarted: boolean = false;
  isEnabled: boolean = false;
  mediaStreamTrack: MediaStreamTrack;

  protected constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super('audio', mediaTrack.id, name);
    this.mediaStreamTrack = mediaTrack;
  }

  // /**
  //  * Create an HTMLAudioElement and attach AudioTrack to it
  //  */
  // attach(): HTMLAudioElement {

  // }

  /**
   * Attach to an existing HTMLAudioElement or HTMLVideoElement
   * @param element
   */
  attach(element: HTMLMediaElement): HTMLMediaElement {
    return element;
  }

  detach(element: HTMLMediaElement): HTMLMediaElement {
    return element;
  }
}

export class RemoteAudioTrack extends AudioTrack {
  // whether the remote audio track is switched off
  isSwitchedOff: boolean = false;

  constructor(mediaTrack: MediaStreamTrack, id: string, name?: string) {
    super(mediaTrack, name);
    // override id to parsed ID
    this.id = id;
  }
}

export class LocalAudioTrack extends AudioTrack {
  constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(mediaTrack, name);
  }
}

export class VideoTrack extends Track {
  isStarted: boolean = false;
  isEnabled: boolean = false;
  mediaStreamTrack: MediaStreamTrack;
  dimensions: VideoTrack.Dimensions;

  protected constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super('video', name || mediaTrack.id);
    this.mediaStreamTrack = mediaTrack;
    this.dimensions = {};
  }

  attach(element: HTMLMediaElement): HTMLMediaElement {
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
  constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(mediaTrack, name);
  }
}
