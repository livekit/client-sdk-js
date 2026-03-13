import { describe, expect, it } from 'vitest';
import {
  TAG_FRAME_ID,
  TAG_TIMESTAMP_US,
  PACKET_TRAILER_SIZE,
  extractPacketTrailer,
  stripPacketTrailerFromEncodedFrame,
} from './PacketTrailerTransformer';

/**
 * Build a frame with a TLV-format LKTS trailer.
 *
 * Wire layout:
 *   [payload] [TLV: timestamp_us] [TLV: frame_id?] [trailer_len ^ 0xFF] [magic]
 */
function buildFrameWithTrailer(payload: Uint8Array, timestampUs: number, frameId?: number) {
  const hasFrameId = frameId !== undefined && frameId !== 0;
  const trailerSize = 10 + (hasFrameId ? 6 : 0) + 5;
  const frame = new Uint8Array(payload.length + trailerSize);
  frame.set(payload, 0);

  const view = new DataView(frame.buffer);
  let off = payload.length;

  // TLV: timestamp_us (tag=0x01, len=8, 8 bytes big-endian, all XORed)
  frame[off++] = TAG_TIMESTAMP_US ^ 0xff;
  frame[off++] = 8 ^ 0xff;
  const high = Math.floor(timestampUs / 0x100000000);
  const low = timestampUs >>> 0;
  view.setUint32(off, high ^ 0xffffffff);
  view.setUint32(off + 4, low ^ 0xffffffff);
  off += 8;

  if (hasFrameId) {
    // TLV: frame_id (tag=0x02, len=4, 4 bytes big-endian, all XORed)
    frame[off++] = TAG_FRAME_ID ^ 0xff;
    frame[off++] = 4 ^ 0xff;
    view.setUint32(off, frameId ^ 0xffffffff);
    off += 4;
  }

  // Envelope: trailer_len (1B, XORed) + magic (4B, not XORed)
  frame[off++] = trailerSize ^ 0xff;
  frame.set([0x4c, 0x4b, 0x54, 0x53], off);

  return frame.buffer;
}

describe('PacketTrailerTransformer', () => {
  it('extracts timestamp and frame id from a TLV trailer', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const frameData = buildFrameWithTrailer(payload, 1741266789123456, 77);

    const result = extractPacketTrailer(frameData);

    expect(result).toStrictEqual({
      payload: payload.buffer,
      timestampUs: 1741266789123456,
      frameId: 77,
    });
  });

  it('extracts timestamp when frame id TLV is omitted', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const frameData = buildFrameWithTrailer(payload, 1741266789123456);

    const result = extractPacketTrailer(frameData);

    expect(result).toStrictEqual({
      payload: payload.buffer,
      timestampUs: 1741266789123456,
      frameId: undefined,
    });
  });

  it('ignores frames without the LKTS trailer magic', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const frame = new Uint8Array(payload.length + PACKET_TRAILER_SIZE);
    frame.set(payload, 0);
    // Fill with arbitrary TLV data but wrong magic (last byte 'T' instead of 'S')
    frame[payload.length + PACKET_TRAILER_SIZE - 5] = PACKET_TRAILER_SIZE ^ 0xff;
    frame.set([0x4c, 0x4b, 0x54, 0x54], payload.length + PACKET_TRAILER_SIZE - 4);

    expect(extractPacketTrailer(frame.buffer)).toBeUndefined();
  });

  it('skips unknown TLV tags and still parses known ones', () => {
    const payload = Uint8Array.from([1, 2, 3]);
    // Build a trailer with an unknown tag (0x99, len=2, 2 junk bytes)
    // followed by the normal timestamp TLV.
    const unknownTlv = [0x99 ^ 0xff, 2 ^ 0xff, 0xaa ^ 0xff, 0xbb ^ 0xff]; // 4 bytes
    const trailerLen = 10 + 6 + unknownTlv.length + 5; // ts(10) + fid(6) + unknown(4) + envelope(5) = 25
    const frame = new Uint8Array(payload.length + trailerLen);
    frame.set(payload, 0);

    let off = payload.length;
    // Unknown tag first
    for (const b of unknownTlv) frame[off++] = b;

    // TLV: timestamp_us
    const view = new DataView(frame.buffer);
    frame[off++] = TAG_TIMESTAMP_US ^ 0xff;
    frame[off++] = 8 ^ 0xff;
    const ts = 1741266789123456;
    view.setUint32(off, Math.floor(ts / 0x100000000) ^ 0xffffffff);
    view.setUint32(off + 4, (ts >>> 0) ^ 0xffffffff);
    off += 8;

    // TLV: frame_id
    frame[off++] = TAG_FRAME_ID ^ 0xff;
    frame[off++] = 4 ^ 0xff;
    view.setUint32(off, 42 ^ 0xffffffff);
    off += 4;

    // Envelope
    frame[off++] = trailerLen ^ 0xff;
    frame.set([0x4c, 0x4b, 0x54, 0x53], off);

    const result = extractPacketTrailer(frame.buffer);
    expect(result).toBeDefined();
    expect(result!.timestampUs).toBe(1741266789123456);
    expect(result!.frameId).toBe(42);
    expect(new Uint8Array(result!.payload)).toStrictEqual(payload);
  });

  it('strips the trailer and returns frame metadata with RTP timestamp', () => {
    const payload = Uint8Array.from([9, 8, 7]);
    const encodedFrame = {
      data: buildFrameWithTrailer(payload, 1741266789123456, 88),
      getMetadata: () => ({ rtpTimestamp: 1234 }),
    } as unknown as RTCEncodedVideoFrame;

    const result = stripPacketTrailerFromEncodedFrame(encodedFrame);

    expect(new Uint8Array(encodedFrame.data)).toStrictEqual(payload);
    expect(result).toStrictEqual({
      timestampUs: 1741266789123456,
      frameId: 88,
      rtpTimestamp: 1234,
    });
  });
});
