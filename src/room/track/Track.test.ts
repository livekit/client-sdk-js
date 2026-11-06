import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MockMediaStreamTrack from '../../test/MockMediaStreamTrack';
import { detachTrack } from './Track';

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const FIREFOX_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:145.0) Gecko/20100101 Firefox/145.0';
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Safari/605.1.15';

const stubUserAgent = (userAgent: string) =>
  vi.stubGlobal('navigator', { userAgent, product: 'Gecko' });

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
  beforeEach(() => {
    stubUserAgent(CHROME_UA);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('releases the stream before removing an audio track in Chromium', () => {
    const element = document.createElement('audio');
    const audioTrack = mockTrack('audio');
    const { srcObjectOnRemove } = attach(element, [audioTrack]);

    detachTrack(audioTrack, element);

    expect(srcObjectOnRemove).toEqual([null]);
    expect(element.srcObject).toBeNull();
  });

  it('reattaches the remaining tracks after removing an audio track in Chromium', () => {
    const element = document.createElement('video');
    const videoTrack = mockTrack('video');
    const audioTrack = mockTrack('audio');
    const { stream, srcObjectOnRemove } = attach(element, [videoTrack, audioTrack]);

    detachTrack(audioTrack, element);

    expect(srcObjectOnRemove).toEqual([null]);
    expect(element.srcObject).toBe(stream);
    expect(stream.getTracks()).toEqual([videoTrack]);
  });

  it.each([
    ['Firefox', FIREFOX_UA],
    ['Safari', SAFARI_UA],
  ])('removes an audio track without releasing the stream in %s', (_, userAgent) => {
    stubUserAgent(userAgent);
    const element = document.createElement('audio');
    const audioTrack = mockTrack('audio');
    const { stream, srcObjectOnRemove } = attach(element, [audioTrack]);

    detachTrack(audioTrack, element);

    expect(srcObjectOnRemove).toEqual([stream]);
    expect(element.srcObject).toBeNull();
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
