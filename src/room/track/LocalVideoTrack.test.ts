import { VideoQuality } from '../../proto/livekit_models';
import { videoLayersFromEncodings } from './LocalVideoTrack';

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
