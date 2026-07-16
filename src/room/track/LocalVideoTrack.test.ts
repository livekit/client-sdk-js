import { describe, expect, it, vi } from 'vitest';
import { getMaxFrameUserDataLength } from '../../frameMetadata/frameMetadata';
import MockMediaStreamTrack from '../../test/MockMediaStreamTrack';
import LocalVideoTrack, { videoLayersFromEncodings } from './LocalVideoTrack';
import { VideoQuality } from './Track';
import type { TrackPublishOptions } from './options';

describe('videoLayersFromEncodings', () => {
  it('returns single layer for no encoding', () => {
    const layers = videoLayersFromEncodings(640, 360);
    expect(layers).toHaveLength(1);
    expect(layers[0].quality).toBe(VideoQuality.HIGH);
    expect(layers[0].width).toBe(640);
    expect(layers[0].height).toBe(360);
  });

  it('returns single layer for explicit encoding', () => {
    const layers = videoLayersFromEncodings(640, 360, [
      {
        maxBitrate: 200_000,
      },
    ]);
    expect(layers).toHaveLength(1);
    expect(layers[0].quality).toBe(VideoQuality.HIGH);
    expect(layers[0].bitrate).toBe(200_000);
  });

  it('returns three layers for simulcast', () => {
    const layers = videoLayersFromEncodings(1280, 720, [
      {
        scaleResolutionDownBy: 4,
        rid: 'q',
        maxBitrate: 125_000,
      },
      {
        scaleResolutionDownBy: 2,
        rid: 'h',
        maxBitrate: 500_000,
      },
      {
        rid: 'f',
        maxBitrate: 1_200_000,
      },
    ]);

    expect(layers).toHaveLength(3);
    expect(layers[0].quality).toBe(VideoQuality.LOW);
    expect(layers[0].width).toBe(320);
    expect(layers[2].quality).toBe(VideoQuality.HIGH);
    expect(layers[2].height).toBe(720);
  });

  it('returns qualities starting from lowest for SVC', () => {
    const layers = videoLayersFromEncodings(
      1280,
      720,
      [
        {
          /** @ts-ignore */
          scalabilityMode: 'L2T2',
        },
      ],
      true,
    );

    expect(layers).toHaveLength(2);
    expect(layers[0].quality).toBe(VideoQuality.MEDIUM);
    expect(layers[0].width).toBe(1280);
    expect(layers[1].quality).toBe(VideoQuality.LOW);
    expect(layers[1].width).toBe(640);
  });

  it('returns qualities starting from lowest for SVC (three layers)', () => {
    const layers = videoLayersFromEncodings(
      1280,
      720,
      [
        {
          /** @ts-ignore */
          scalabilityMode: 'L3T3',
        },
      ],
      true,
    );

    expect(layers).toHaveLength(3);
    expect(layers[0].quality).toBe(VideoQuality.HIGH);
    expect(layers[0].width).toBe(1280);
    expect(layers[1].quality).toBe(VideoQuality.MEDIUM);
    expect(layers[1].width).toBe(640);
    expect(layers[2].quality).toBe(VideoQuality.LOW);
    expect(layers[2].width).toBe(320);
  });

  it('returns qualities starting from lowest for SVC (single layer)', () => {
    const layers = videoLayersFromEncodings(
      1280,
      720,
      [
        {
          /** @ts-ignore */
          scalabilityMode: 'L1T2',
        },
      ],
      true,
    );

    expect(layers).toHaveLength(1);
    expect(layers[0].quality).toBe(VideoQuality.LOW);
    expect(layers[0].width).toBe(1280);
  });

  it('handles portrait', () => {
    const layers = videoLayersFromEncodings(720, 1280, [
      {
        scaleResolutionDownBy: 4,
        rid: 'q',
        maxBitrate: 125_000,
      },
      {
        scaleResolutionDownBy: 2,
        rid: 'h',
        maxBitrate: 500_000,
      },
      {
        rid: 'f',
        maxBitrate: 1_200_000,
      },
    ]);
    expect(layers).toHaveLength(3);
    expect(layers[0].quality).toBe(VideoQuality.LOW);
    expect(layers[0].height).toBe(320);
    expect(layers[2].quality).toBe(VideoQuality.HIGH);
    expect(layers[2].width).toBe(720);
  });
});

describe('attachUserDataToNextFrame', () => {
  // constructing a LocalVideoTrack requires more browser APIs than happy-dom
  // provides, so build a minimal instance with just the state the method uses
  function createTrack(publishOptions?: TrackPublishOptions) {
    const track = Object.create(LocalVideoTrack.prototype) as LocalVideoTrack;
    const warn = vi.fn();
    Object.assign(track, {
      _mediaStreamTrack: new MockMediaStreamTrack(),
      log: { warn },
      publishOptions,
    });
    const poster = vi.fn();
    track.frameUserDataPoster = poster;
    return { track, poster, warn };
  }

  it('posts user data to the encode pipeline', () => {
    const { track, poster, warn } = createTrack({ frameMetadata: { userData: true } });
    const userData = Uint8Array.from([1, 2, 3]);

    track.attachUserDataToNextFrame(userData);

    expect(poster).toHaveBeenCalledWith(userData);
    expect(warn).not.toHaveBeenCalled();
  });

  it('normalizes undefined and empty user data to a clear', () => {
    const { track, poster } = createTrack({ frameMetadata: { userData: true } });

    track.attachUserDataToNextFrame(undefined);
    track.attachUserDataToNextFrame(new Uint8Array(0));

    expect(poster).toHaveBeenNthCalledWith(1, undefined);
    expect(poster).toHaveBeenNthCalledWith(2, undefined);
  });

  it('warns and ignores user data when the publish options do not enable it', () => {
    const { track, poster, warn } = createTrack({ frameMetadata: { timestamp: true } });

    track.attachUserDataToNextFrame(Uint8Array.from([1, 2, 3]));

    expect(poster).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('warns and ignores user data when no encode pipeline is active', () => {
    const { track, poster, warn } = createTrack({ frameMetadata: { userData: true } });
    track.frameUserDataPoster = undefined;

    track.attachUserDataToNextFrame(Uint8Array.from([1, 2, 3]));

    expect(poster).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it('accepts the deprecated packetTrailer publish options alias', () => {
    const { track, poster } = createTrack({ packetTrailer: { userData: true } });
    const userData = Uint8Array.from([1, 2, 3]);

    track.attachUserDataToNextFrame(userData);

    expect(poster).toHaveBeenCalledWith(userData);
  });

  it('throws a RangeError when user data exceeds the trailer capacity', () => {
    const options = { userData: true, timestamp: true, frameId: true };
    const { track, poster } = createTrack({ frameMetadata: options });

    const maxLength = getMaxFrameUserDataLength(options);
    expect(() => track.attachUserDataToNextFrame(new Uint8Array(maxLength + 1))).toThrowError(
      RangeError,
    );
    expect(poster).not.toHaveBeenCalled();

    track.attachUserDataToNextFrame(new Uint8Array(maxLength).fill(1));
    expect(poster).toHaveBeenCalledTimes(1);
  });
});
