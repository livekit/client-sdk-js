import { TrackEvent } from '../events';
import { LocalAudioTrack } from './LocalAudioTrack';
import { LocalVideoTrack } from './LocalVideoTrack';

// attachment/detachment helpers
export function attachTrack(
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

export function detachTracks(
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

export function detachTrack(
  track: MediaStreamTrack,
  element: HTMLMediaElement
) {
  if (element.srcObject instanceof MediaStream) {
    const mediaStream = element.srcObject;
    mediaStream.removeTrack(track);
  }
}

export function setTrackMuted(
  track: LocalVideoTrack | LocalAudioTrack,
  muted: boolean
) {
  if (track.isMuted === muted) {
    return;
  }

  track.mediaStreamTrack.enabled = !muted;
  track.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, track);
}
