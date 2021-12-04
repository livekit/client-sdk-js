import { VideoPresets } from '../..';
import { computeVideoEncodings } from './LocalParticipant';

describe('computeVideoEncodings', () => {
  it('returns nil non-simulcast', () => {
    const encodings = computeVideoEncodings(false, 640, 480, {
      simulcast: false,
    });
    expect(encodings).toBeUndefined();
  });

  it('respects client defined bitrate', () => {
    const encodings = computeVideoEncodings(false, 640, 480, {
      simulcast: false,
      videoEncoding: {
        maxBitrate: 1024,
      },
    });
    expect(encodings).toHaveLength(1);
    expect(encodings![0].maxBitrate).toBe(1024);
  });

  it('returns three encodings for high-res simulcast', () => {
    const encodings = computeVideoEncodings(false, 960, 540, {
      simulcast: true,
    });
    expect(encodings).toHaveLength(3);

    // ensure they are what we expect
    expect(encodings![0].rid).toBe('q');
    expect(encodings![0].maxBitrate).toBe(VideoPresets.qvga.encoding.maxBitrate);
    expect(encodings![1].rid).toBe('h');
    expect(encodings![2].rid).toBe('f');
  });

  it('returns two encodings for lower-res simulcast', () => {
    const encodings = computeVideoEncodings(false, 640, 360, {
      simulcast: true,
    });
    expect(encodings).toHaveLength(2);

    // ensure they are what we expect
    expect(encodings![0].rid).toBe('q');
    expect(encodings![0].maxBitrate).toBe(VideoPresets.qvga.encoding.maxBitrate);
    expect(encodings![1].rid).toBe('h');
    expect(encodings![1].maxBitrate).toBe(VideoPresets.vga.encoding.maxBitrate);
  });
});
