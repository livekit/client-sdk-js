import { describe, expect, it } from 'vitest';
import { appendPacketTrailer, extractPacketTrailer } from './packetTrailer';

describe('packetTrailer', () => {
  it('extracts user timestamp and frame id using the Rust wire format', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const trailer = appendPacketTrailer(payload, 1_744_249_600_123_456, 42);
    const extracted = extractPacketTrailer(trailer);

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata).toEqual({
      userTimestampUs: 1_744_249_600_123_456,
      frameId: 42,
    });
  });

  it('passes frames through when there is no valid trailer', () => {
    const payload = Uint8Array.from([1, 2, 3, 4, 5]);
    const extracted = extractPacketTrailer(payload);

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata).toBeUndefined();
  });
});
