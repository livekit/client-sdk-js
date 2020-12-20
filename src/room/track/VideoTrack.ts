import { Track } from './Track';
import { attachTrack, detachTracks } from './utils';

export namespace VideoTrack {
  export interface Dimensions {
    width?: number;
    height?: number;
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
