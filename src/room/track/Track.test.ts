import { describe, expect, it } from 'vitest';
import MockMediaStreamTrack from '../../test/MockMediaStreamTrack';
import { detachTrack } from './Track';

const mockTrack = (kind: 'audio' | 'video') => {
  const track = new MockMediaStreamTrack();
  track.kind = kind;
  return track as MediaStreamTrack;
};

/** happy-dom's MediaStream implements everything except getTracks(), which detachTrack() reads. */
class TestMediaStream extends MediaStream {
  getTracks() {
    return [...this.getAudioTracks(), ...this.getVideoTracks()];
  }
}

// Attaches the tracks to the element and records the element's srcObject each time a track is
// removed from the stream.
const attach = (element: HTMLMediaElement, tracks: MediaStreamTrack[]) => {
  const stream = new TestMediaStream(tracks);
  element.srcObject = stream;
  const srcObjectOnRemove: Array<MediaProvider | null> = [];
  const removeTrack = stream.removeTrack.bind(stream);
  stream.removeTrack = (track) => {
    srcObjectOnRemove.push(element.srcObject);
    removeTrack(track);
  };
  return { stream, srcObjectOnRemove };
};

describe('detachTrack', () => {
  it('releases the stream before removing an audio track', () => {
    const element = document.createElement('audio');
    const audioTrack = mockTrack('audio');
    const { srcObjectOnRemove } = attach(element, [audioTrack]);

    detachTrack(audioTrack, element);

    expect(srcObjectOnRemove).toEqual([null]);
    expect(element.srcObject).toBeNull();
  });

  it('reattaches the remaining tracks after removing an audio track', () => {
    const element = document.createElement('video');
    const videoTrack = mockTrack('video');
    const audioTrack = mockTrack('audio');
    const { stream, srcObjectOnRemove } = attach(element, [videoTrack, audioTrack]);

    detachTrack(audioTrack, element);

    expect(srcObjectOnRemove).toEqual([null]);
    expect(element.srcObject).toBe(stream);
    expect(stream.getTracks()).toEqual([videoTrack]);
  });

  it('removes a video track without releasing the stream', () => {
    const element = document.createElement('video');
    const videoTrack = mockTrack('video');
    const audioTrack = mockTrack('audio');
    const { stream, srcObjectOnRemove } = attach(element, [videoTrack, audioTrack]);

    detachTrack(videoTrack, element);

    expect(srcObjectOnRemove).toEqual([stream]);
    expect(element.srcObject).toBe(stream);
    expect(stream.getTracks()).toEqual([audioTrack]);
  });
});
