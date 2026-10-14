import { describe, expect, it } from 'vitest';
import { normalizeAnnexBStartCodes, processNALUsForEncryption } from './naluUtils';

/** Annex-B frame: a 4-byte start code before every NALU. */
function annexB(...nalus: number[][]) {
  return Uint8Array.from(nalus.flatMap((nalu) => [0x00, 0x00, 0x00, 0x01, ...nalu]));
}

// h264: 0x06 SEI, 0x65 IDR slice, 0x67 SPS. h265: 0x26 IDR_W_RADL slice.
// An h264 SEI byte (0x06) reads as h265 TSA_R, which is why the SEI leads here.
// findNALUIndices stops at stream.length - 3. A trailing NALU with fewer than 4 payload
// bytes is never indexed, so its fixture tests nothing. Interior NALUs are fine at any
// length, because the next start code ends them.
const h264KeyFrame = annexB([0x06, 0x11, 0x22], [0x65, 0x33, 0x44, 0x55, 0x66]);
const h265KeyFrame = annexB([0x26, 0x11, 0x22], [0x02, 0x33, 0x44, 0x55, 0x66]);
const noSliceFrame = annexB([0x67, 0x11, 0x22, 0x33, 0x44, 0x55]);
// 0x25 is a slice under both: h264 &0x1f = 5 IDR, h265 (b >> 1) & 0x3f = 18 BLA_W_RADL.
const ambiguousFrame = annexB([0x25, 0x11, 0x22, 0x33, 0x44, 0x55]);

describe('normalizeAnnexBStartCodes', () => {
  it('rewrites 3-byte start codes to 4-byte start codes', () => {
    // prettier-ignore
    const input = new Uint8Array([
      0x00, 0x00, 0x01, 0x67, 0x64, // SPS
      0x00, 0x00, 0x01, 0x68, 0xee, // PPS
      0x00, 0x00, 0x01, 0x65, 0x88, // IDR slice
    ]);
    // prettier-ignore
    const expected = new Uint8Array([
      0x00, 0x00, 0x00, 0x01, 0x67, 0x64,
      0x00, 0x00, 0x00, 0x01, 0x68, 0xee,
      0x00, 0x00, 0x00, 0x01, 0x65, 0x88,
    ]);

    expect(normalizeAnnexBStartCodes(input)).toEqual(expected);
  });

  it('rewrites only the 3-byte start codes when mixed with 4-byte ones', () => {
    // prettier-ignore
    const input = new Uint8Array([
      0x00, 0x00, 0x00, 0x01, 0x67, 0x64,
      0x00, 0x00, 0x01, 0x68, 0xee,
      0x00, 0x00, 0x00, 0x01, 0x06, 0x05,
      0x00, 0x00, 0x01, 0x65, 0x88,
    ]);
    // prettier-ignore
    const expected = new Uint8Array([
      0x00, 0x00, 0x00, 0x01, 0x67, 0x64,
      0x00, 0x00, 0x00, 0x01, 0x68, 0xee,
      0x00, 0x00, 0x00, 0x01, 0x06, 0x05,
      0x00, 0x00, 0x00, 0x01, 0x65, 0x88,
    ]);

    expect(normalizeAnnexBStartCodes(input)).toEqual(expected);
  });

  it('returns the same instance when all start codes are already 4-byte', () => {
    // prettier-ignore
    const input = new Uint8Array([
      0x00, 0x00, 0x00, 0x01, 0x67, 0x64,
      0x00, 0x00, 0x00, 0x01, 0x65, 0x88,
    ]);

    expect(normalizeAnnexBStartCodes(input)).toBe(input);
  });

  it('does not add a zero when a start code already has extra leading zeros', () => {
    const input = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01, 0x65, 0x88]);

    expect(normalizeAnnexBStartCodes(input)).toBe(input);
  });
});

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

  it('resolves a byte that is a slice under both codecs as h264', () => {
    // Only the h264-first ordering decides this one. Swap the two loops back and it reads h265.
    expect(processNALUsForEncryption(ambiguousFrame)).toEqual({
      unencryptedBytes: 6,
      detectedCodec: 'h264',
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
