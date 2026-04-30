import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendPacketTrailer,
  appendPacketTrailerToEncodedFrame,
  extractPacketTrailer,
  processPacketTrailer,
} from './packetTrailer';

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
