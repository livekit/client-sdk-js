import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PACKET_TRAILER_ENVELOPE_SIZE,
  PACKET_TRAILER_FRAME_ID_TAG,
  PACKET_TRAILER_MAGIC,
  PACKET_TRAILER_TIMESTAMP_TAG,
  PACKET_TRAILER_USER_DATA_TAG,
  appendPacketTrailer,
  appendPacketTrailerToEncodedFrame,
  extractPacketTrailer,
  processPacketTrailer,
} from './frameMetadata';

/**
 * Builds a packet trailer (XORed TLVs + envelope) for the given fields. The
 * SDK only writes timestamp/frameId, so this mirrors the native sender's TLV
 * encoding to exercise user_data extraction.
 */
function buildTrailer(
  payload: Uint8Array,
  fields: { userTimestamp?: bigint; frameId?: number; userData?: Uint8Array },
): Uint8Array {
  const tlvs: number[] = [];

  if (fields.userTimestamp !== undefined) {
    tlvs.push(PACKET_TRAILER_TIMESTAMP_TAG ^ 0xff, 8 ^ 0xff);
    for (let i = 7; i >= 0; i -= 1) {
      tlvs.push(Number((fields.userTimestamp >> BigInt(i * 8)) & BigInt(0xff)) ^ 0xff);
    }
  }

  if (fields.frameId !== undefined) {
    tlvs.push(PACKET_TRAILER_FRAME_ID_TAG ^ 0xff, 4 ^ 0xff);
    for (let i = 3; i >= 0; i -= 1) {
      tlvs.push(((fields.frameId >> (i * 8)) & 0xff) ^ 0xff);
    }
  }

  if (fields.userData !== undefined) {
    tlvs.push(PACKET_TRAILER_USER_DATA_TAG ^ 0xff, fields.userData.length ^ 0xff);
    for (const byte of fields.userData) {
      tlvs.push(byte ^ 0xff);
    }
  }

  const trailerLength = tlvs.length + PACKET_TRAILER_ENVELOPE_SIZE;
  const result = new Uint8Array(payload.length + trailerLength);
  result.set(payload, 0);
  result.set(tlvs, payload.length);
  result[payload.length + tlvs.length] = trailerLength ^ 0xff;
  result.set(PACKET_TRAILER_MAGIC, payload.length + tlvs.length + 1);
  return result;
}

describe('packetTrailer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('extracts user timestamp and frame id from packet trailer', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const trailer = appendPacketTrailer(payload, 1_744_249_600_123_456n, 42);
    const extracted = extractPacketTrailer(trailer);

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata).toEqual({
      userTimestamp: 1_744_249_600_123_456n,
      frameId: 42,
    });
  });

  it('extracts timestamp-only trailer when frameId is 0', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const trailer = appendPacketTrailer(payload, 1_744_249_600_123_456n, 0);
    const extracted = extractPacketTrailer(trailer);

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata).toEqual({
      userTimestamp: 1_744_249_600_123_456n,
      frameId: 0,
    });
  });

  it('extracts frameId-only trailer when timestamp is 0', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const trailer = appendPacketTrailer(payload, 0n, 42);
    const extracted = extractPacketTrailer(trailer);

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata).toEqual({
      userTimestamp: 0n,
      frameId: 42,
    });
  });

  it('extracts user_data from a trailer carrying only user_data', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const userData = Uint8Array.from([0x00, 0x01, 0xfe, 0xff, 0x42]);
    const trailer = buildTrailer(payload, { userData });
    const extracted = extractPacketTrailer(trailer);

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata?.userTimestamp).toBe(0n);
    expect(extracted.metadata?.frameId).toBe(0);
    expect(extracted.metadata?.userData).toBeInstanceOf(Uint8Array);
    expect(Array.from(extracted.metadata!.userData!)).toEqual(Array.from(userData));
  });

  it('extracts user_data alongside timestamp and frameId', () => {
    const payload = Uint8Array.from([9, 8, 7, 6, 5]);
    const userData = Uint8Array.from([10, 20, 30, 40]);
    const trailer = buildTrailer(payload, {
      userTimestamp: 1_744_249_600_123_456n,
      frameId: 42,
      userData,
    });
    const extracted = extractPacketTrailer(trailer);

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata?.userTimestamp).toBe(1_744_249_600_123_456n);
    expect(extracted.metadata?.frameId).toBe(42);
    expect(Array.from(extracted.metadata!.userData!)).toEqual(Array.from(userData));
  });

  it('leaves userData undefined when no user_data tag is present', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const trailer = appendPacketTrailer(payload, 1_744_249_600_123_456n, 42);
    const extracted = extractPacketTrailer(trailer);

    expect(extracted.metadata?.userData).toBeUndefined();
  });

  it('returns data unchanged when both timestamp and frameId are 0', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const result = appendPacketTrailer(payload, 0n, 0);

    expect(Array.from(result)).toEqual(Array.from(payload));
  });

  it('passes frames through when there is no valid trailer', () => {
    const payload = Uint8Array.from([1, 2, 3, 4, 5]);
    const extracted = extractPacketTrailer(payload);

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata).toBeUndefined();
  });

  it('uses the encoded frame timestamp when metadata does not include an RTP timestamp', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const trailer = appendPacketTrailer(payload, 1_744_249_600_123_456n, 42);
    const frame = {
      data: trailer.buffer,
      timestamp: 1234,
      getMetadata() {
        return {};
      },
    } as unknown as RTCEncodedVideoFrame;

    const result = processPacketTrailer(frame, 'track-id');

    expect(result.payload).toEqual({
      trackId: 'track-id',
      rtpTimestamp: 1234,
      ssrc: 0,
      metadata: {
        userTimestamp: 1_744_249_600_123_456n,
        frameId: 42,
      },
    });
  });

  it('appends timestamp-only packet trailer to encoded frames', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-04-10T12:00:00.123Z'));
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const frame = { data: payload.buffer } as RTCEncodedVideoFrame;

    appendPacketTrailerToEncodedFrame(frame, { timestamp: true }, 0);
    const extracted = extractPacketTrailer(frame.data);

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(frame.data.byteLength).toBe(payload.byteLength + 15);
    expect(extracted.metadata).toEqual({
      userTimestamp: BigInt(Date.now()) * BigInt(1000),
      frameId: 0,
    });
  });

  it('appends frame-id-only packet trailer to encoded frames', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const firstFrame = { data: payload.buffer.slice(0) } as RTCEncodedVideoFrame;
    const secondFrame = { data: payload.buffer.slice(0) } as RTCEncodedVideoFrame;

    appendPacketTrailerToEncodedFrame(firstFrame, { frameId: true }, 1);
    appendPacketTrailerToEncodedFrame(secondFrame, { frameId: true }, 2);

    expect(firstFrame.data.byteLength).toBe(payload.byteLength + 11);
    expect(secondFrame.data.byteLength).toBe(payload.byteLength + 11);
    expect(extractPacketTrailer(firstFrame.data).metadata).toEqual({
      userTimestamp: 0n,
      frameId: 1,
    });
    expect(extractPacketTrailer(secondFrame.data).metadata).toEqual({
      userTimestamp: 0n,
      frameId: 2,
    });
  });

  it('appends both timestamp and frame id to encoded frames', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-04-10T12:00:00.123Z'));
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const frame = { data: payload.buffer } as RTCEncodedVideoFrame;

    appendPacketTrailerToEncodedFrame(frame, { timestamp: true, frameId: true }, 7);

    expect(extractPacketTrailer(frame.data).metadata).toEqual({
      userTimestamp: BigInt(Date.now()) * BigInt(1000),
      frameId: 7,
    });
  });

  it.each([{}, { timestamp: false, frameId: false }])(
    'passes encoded frames through when no write features are enabled: %o',
    (packetTrailer) => {
      const payload = Uint8Array.from([1, 2, 3, 4]);
      const frame = { data: payload.buffer } as RTCEncodedVideoFrame;

      const changed = appendPacketTrailerToEncodedFrame(frame, packetTrailer, 1);

      expect(changed).toBe(false);
      expect(frame.data).toBe(payload.buffer);
      expect(extractPacketTrailer(frame.data).metadata).toBeUndefined();
    },
  );

  it('passes encoded frames through when publish options omit enabled features', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const frame = { data: payload.buffer } as RTCEncodedVideoFrame;

    const changed = appendPacketTrailerToEncodedFrame(frame, { timestamp: false }, 1);

    expect(changed).toBe(false);
    expect(frame.data).toBe(payload.buffer);
    expect(extractPacketTrailer(frame.data).metadata).toBeUndefined();
  });

  it('passes encoded frames through when publish options are undefined', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const frame = { data: payload.buffer } as RTCEncodedVideoFrame;

    const changed = appendPacketTrailerToEncodedFrame(frame, undefined, 1);

    expect(changed).toBe(false);
    expect(frame.data).toBe(payload.buffer);
  });
});
