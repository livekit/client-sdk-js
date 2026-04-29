import { describe, expect, it } from 'vitest';
import { appendPacketTrailer, extractPacketTrailer, processPacketTrailer } from './packetTrailer';

describe('packetTrailer', () => {
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
});
