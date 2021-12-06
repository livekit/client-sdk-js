import { VideoPresets } from '../track/options';
import {
  computeVideoEncodings,
  determineAppropriateEncoding,
  presets169,
  presets43,
  presetsForResolution,
  presetsScreenShare,
} from './LocalParticipant';

describe('presetsForResolution', () => {
  it('handles screenshare', () => {
    expect(presetsForResolution(true, 600, 300)).toEqual(presetsScreenShare);
  });

  it('handles landscape', () => {
    expect(presetsForResolution(false, 600, 300)).toEqual(presets169);
    expect(presetsForResolution(false, 500, 500)).toEqual(presets43);
  });

  it('handles portrait', () => {
    expect(presetsForResolution(false, 300, 600)).toEqual(presets169);
    expect(presetsForResolution(false, 500, 500)).toEqual(presets43);
  });
});

describe('determineAppropriateEncoding', () => {
  it('uses higher encoding', () => {
    expect(determineAppropriateEncoding(false, 600, 300))
      .toEqual(VideoPresets.vga.encoding);
  });

  it('handles portrait', () => {
    expect(determineAppropriateEncoding(false, 300, 600))
      .toEqual(VideoPresets.vga.encoding);
  });
});

describe('computeVideoPublishSettings', () => {
  it('handles non-simulcast', () => {
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

  it('handles portrait simulcast', () => {
    const encodings = computeVideoEncodings(false, 540, 960, {
      simulcast: true,
    });
    expect(encodings).toHaveLength(3);
    expect(encodings![2].maxBitrate).toBe(VideoPresets.qhd.encoding.maxBitrate);
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
