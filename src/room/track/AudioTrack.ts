import { Track } from './Track';
import { attachTrack, detachTracks } from './utils';

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
