import { EventEmitter } from 'events';

export type LocalTrack = LocalAudioTrack | LocalVideoTrack;
export type RemoteTrack = RemoteAudioTrack | RemoteVideoTrack;

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
  attachedElements: HTMLMediaElement[] = [];

  protected constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super('audio', mediaTrack.id, name);
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

  constructor(mediaTrack: MediaStreamTrack, id: string) {
    super(mediaTrack);
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
  dimensions: VideoTrack.Dimensions = {};
  attachedElements: HTMLVideoElement[] = [];

  protected constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super('video', name || mediaTrack.label);
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
  constructor(mediaTrack: MediaStreamTrack, name?: string) {
    super(mediaTrack, name);
  }
}

export class RemoteVideoTrack extends VideoTrack {
  constructor(mediaTrack: MediaStreamTrack, id: string) {
    super(mediaTrack);
    // override id to parsed ID
    this.id = id;
  }
}
