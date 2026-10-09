import { describe, expect, it } from 'vitest';
import { processNALUsForEncryption } from './naluUtils';

/** Annex-B frame: a 4-byte start code before every NALU. */
function annexB(...nalus: number[][]) {
  return Uint8Array.from(nalus.flatMap((nalu) => [0x00, 0x00, 0x00, 0x01, ...nalu]));
}

// h264: 0x06 SEI, 0x65 IDR slice, 0x67 SPS. h265: 0x26 IDR_W_RADL slice.
// An h264 SEI byte (0x06) reads as h265 TSA_R, which is why the SEI leads here.
const h264KeyFrame = annexB([0x06, 0x11, 0x22], [0x65, 0x33, 0x44, 0x55, 0x66]);
const h265KeyFrame = annexB([0x26, 0x11, 0x22], [0x02, 0x33, 0x44, 0x55, 0x66]);
const noSliceFrame = annexB([0x67, 0x11, 0x22]);

describe('processNALUsForEncryption', () => {
  it('slices at the h264 slice NALU even when seeded with h265', () => {
    // The whole point: the h265 seed must not win, or the offset lands at 6 (inside the
    // SEI) and the slice header gets encrypted with no error raised.
    expect(processNALUsForEncryption(h264KeyFrame, 'h265')).toEqual({
      unencryptedBytes: 13,
      detectedCodec: 'h264',
      requiresNALUProcessing: true,
    });
  });

  it('reads an h264 frame whose SEI precedes the slice as h264', () => {
    expect(processNALUsForEncryption(h264KeyFrame)).toEqual({
      unencryptedBytes: 13,
      detectedCodec: 'h264',
      requiresNALUProcessing: true,
    });
  });

  it('still reads an h265 frame as h265', () => {
    expect(processNALUsForEncryption(h265KeyFrame)).toEqual({
      unencryptedBytes: 6,
      detectedCodec: 'h265',
      requiresNALUProcessing: true,
    });
    expect(processNALUsForEncryption(h265KeyFrame, 'h264')).toEqual({
      unencryptedBytes: 6,
      detectedCodec: 'h265',
      requiresNALUProcessing: true,
    });
  });

  it('throws with a seed, and returns quietly without one, when no slice NALU is present', () => {
    expect(() => processNALUsForEncryption(noSliceFrame, 'h264')).toThrow('Could not find NALU');
    expect(processNALUsForEncryption(noSliceFrame)).toEqual({
      unencryptedBytes: 0,
      detectedCodec: 'unknown',
      requiresNALUProcessing: false,
    });
  });
});
