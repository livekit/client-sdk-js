import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AV1_METADATA_TYPE_LIVEKIT_PACKET_TRAILER,
  appendPacketTrailer,
  appendPacketTrailerToEncodedFrame,
  extractPacketTrailer,
  processPacketTrailer,
} from './packetTrailer';

const AV1_OBU_TYPE_METADATA = 5;
const AV1_OBU_TYPE_SEQUENCE_HEADER = 1;
const AV1_OBU_TYPE_TEMPORAL_DELIMITER = 2;
const AV1_OBU_TYPE_FRAME = 6;
const AV1_OBU_SIZE_PRESENT_BIT = 0b0000_0010;

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function av1Obu(type: number, payload: Uint8Array): Uint8Array {
  return concatBytes(
    Uint8Array.from([(type << 3) | AV1_OBU_SIZE_PRESENT_BIT, payload.length]),
    payload,
  );
}

function av1MetadataObu(metadataType: number, payload: Uint8Array): Uint8Array {
  return av1Obu(AV1_OBU_TYPE_METADATA, concatBytes(Uint8Array.from([metadataType]), payload));
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

  it('returns data unchanged when both timestamp and frameId are 0', () => {
    const payload = Uint8Array.from([1, 2, 3, 4]);
    const result = appendPacketTrailer(payload, 0n, 0);

    expect(Array.from(result)).toEqual(Array.from(payload));
  });

  it('wraps packet trailer metadata in a custom AV1 metadata OBU', () => {
    const payload = av1Obu(AV1_OBU_TYPE_FRAME, Uint8Array.from([1, 2, 3, 4]));
    const withTrailer = appendPacketTrailer(payload, 1_744_249_600_123_456n, 42, 'av1');
    const extracted = extractPacketTrailer(withTrailer, 'av1');

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata).toEqual({
      userTimestamp: 1_744_249_600_123_456n,
      frameId: 42,
    });
    expect(extractPacketTrailer(withTrailer).metadata).toBeUndefined();
  });

  it('inserts AV1 packet trailer metadata after temporal delimiter and sequence headers', () => {
    const temporalDelimiter = av1Obu(AV1_OBU_TYPE_TEMPORAL_DELIMITER, Uint8Array.from([]));
    const sequenceHeader = av1Obu(AV1_OBU_TYPE_SEQUENCE_HEADER, Uint8Array.from([0xaa, 0xbb]));
    const frameObu = av1Obu(AV1_OBU_TYPE_FRAME, Uint8Array.from([0x01, 0x02]));
    const prefix = concatBytes(temporalDelimiter, sequenceHeader);
    const payload = concatBytes(prefix, frameObu);

    const withTrailer = appendPacketTrailer(payload, 1_744_249_600_123_456n, 0, 'av1');

    expect(Array.from(withTrailer.subarray(0, prefix.length))).toEqual(Array.from(prefix));
    expect(withTrailer[prefix.length]).toBe(
      (AV1_OBU_TYPE_METADATA << 3) | AV1_OBU_SIZE_PRESENT_BIT,
    );
    expect(Array.from(extractPacketTrailer(withTrailer, 'av1').data)).toEqual(Array.from(payload));
  });

  it('removes only LiveKit AV1 metadata OBUs and preserves other metadata OBUs', () => {
    const otherMetadata = av1MetadataObu(1, Uint8Array.from([0xaa]));
    const frameObu = av1Obu(AV1_OBU_TYPE_FRAME, Uint8Array.from([0x01, 0x02]));
    const payload = concatBytes(otherMetadata, frameObu);

    const withTrailer = appendPacketTrailer(payload, 0n, 42, 'av1');
    const extracted = extractPacketTrailer(withTrailer, 'av1');

    expect(Array.from(extracted.data)).toEqual(Array.from(payload));
    expect(extracted.metadata).toEqual({
      userTimestamp: 0n,
      frameId: 42,
    });
  });

  it('passes AV1 frames through when metadata is not a valid LiveKit packet trailer', () => {
    const nonLiveKitMetadata = av1MetadataObu(1, Uint8Array.from([0xaa]));
    const invalidLiveKitMetadata = av1MetadataObu(
      AV1_METADATA_TYPE_LIVEKIT_PACKET_TRAILER,
      Uint8Array.from([0x00, 0x01, 0x02]),
    );
    const invalidObu = Uint8Array.from([0x80, 0x00]);

    expect(extractPacketTrailer(nonLiveKitMetadata, 'av1')).toEqual({
      data: nonLiveKitMetadata,
    });
    expect(extractPacketTrailer(invalidLiveKitMetadata, 'av1')).toEqual({
      data: invalidLiveKitMetadata,
    });
    expect(extractPacketTrailer(invalidObu, 'av1')).toEqual({ data: invalidObu });
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

  it('processes AV1 packet trailer metadata from encoded frames', () => {
    const payload = av1Obu(AV1_OBU_TYPE_FRAME, Uint8Array.from([1, 2, 3, 4]));
    const trailer = appendPacketTrailer(payload, 1_744_249_600_123_456n, 42, 'av1');
    const frame = {
      data: trailer.buffer,
      timestamp: 1234,
      getMetadata() {
        return {};
      },
    } as unknown as RTCEncodedVideoFrame;

    const result = processPacketTrailer(frame, 'track-id', 'av1');

    expect(new Uint8Array(result.data ?? new ArrayBuffer(0))).toEqual(payload);
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
