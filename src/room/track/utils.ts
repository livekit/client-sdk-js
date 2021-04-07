import log from 'loglevel';
import { TrackInvalidError } from '../errors';
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
  if (attachedElements.includes(element)) {
    return element;
  }

  _attachTrack(track, element);
  attachedElements.push(element);

  return element;
}

function _attachTrack(track: MediaStreamTrack, element: HTMLMediaElement) {
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

/** @internal */
export function setTrackMuted(
  track: LocalVideoTrack | LocalAudioTrack,
  muted: boolean
) {
  if (track.isMuted === muted) {
    return;
  }

  track.isMuted = muted;
  track.mediaStreamTrack.enabled = !muted;
  track.emit(muted ? TrackEvent.Muted : TrackEvent.Unmuted, track);
}

export async function restartTrack(
  track: LocalAudioTrack | LocalVideoTrack,
  constraints?: MediaTrackConstraints
) {
  if (!track.sender) {
    throw new TrackInvalidError('unable to restart an unpublished track');
  }
  if (!constraints) {
    constraints = track._constraints;
  }

  // copy existing elements and detach
  track.mediaStreamTrack.stop();

  const streamConstraints: MediaStreamConstraints = {
    audio: false,
    video: false,
  };

  if (track instanceof LocalVideoTrack) {
    streamConstraints.video = constraints;
  } else {
    streamConstraints.audio = constraints;
  }

  // TODO: for safari, there is a bug that might cause this to be wonky
  // _workaroundWebKitBug1208516

  const newTrack = await (
    await navigator.mediaDevices.getUserMedia(streamConstraints)
  ).getTracks()[0];
  log.info('re-acquired MediaStreamTrack');
  track._constraints = constraints;

  newTrack.enabled = track.mediaStreamTrack.enabled;
  await track.sender.replaceTrack(newTrack);
  track.mediaStreamTrack = newTrack;

  track.attachedElements.forEach((el) => {
    _attachTrack(newTrack, el);
  });
}
