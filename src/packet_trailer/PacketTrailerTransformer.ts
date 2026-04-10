/**
 * Utilities for parsing LiveKit packet trailer (LKTS) from encoded
 * video frames on the receive side.
 *
 * Trailer wire format (matches rust-sdks packet_trailer.h):
 *
 *   [TLV...] [trailer_len: 1B] [magic "LKTS": 4B]
 *
 * Each TLV element is: [tag: 1B] [len: 1B] [value: len bytes]
 * All TLV bytes (tag, len, value) and trailer_len are XORed with 0xFF
 * to avoid H.264 NAL start code sequences.  Magic is NOT XORed.
 *
 * Defined tags:
 *   0x01 - timestamp_us (8 bytes, big-endian int64, microseconds since epoch)
 *   0x02 - frame_id     (4 bytes, big-endian uint32, omitted when unset/0)
 *
 * Unknown tags are silently skipped, so new fields can be added without
 * breaking older readers.
 */

export interface UserFrameMetadata {
  /** Embedded user timestamp in microseconds since Unix epoch. */
  timestampUs: number;
  /** Monotonic SDK-generated frame id carried in the trailer. */
  frameId?: number;
}

export interface PacketTrailerInfo extends UserFrameMetadata {
  /** Frame payload with the LKTS trailer removed. */
  payload: ArrayBuffer;
}

export interface PacketTrailerWithRtp extends UserFrameMetadata {
  /** RTP timestamp from the encoded frame (90 kHz clock for video). */
  rtpTimestamp: number;
}

/** ASCII bytes for 'L', 'K', 'T', 'S'. */
export const PACKET_TRAILER_MAGIC = Uint8Array.from([0x4c, 0x4b, 0x54, 0x53]);
/** Envelope: [trailer_len: 1B] [magic: 4B] */
export const PACKET_TRAILER_ENVELOPE_SIZE = 5;

/** TLV tag IDs */
export const TAG_TIMESTAMP_US = 0x01;
export const TAG_FRAME_ID = 0x02;

/** Trailer size when both timestamp_us and frame_id are present. */
export const PACKET_TRAILER_SIZE = 21;

/**
 * Extracts an LKTS trailer from the end of an encoded frame, if present.
 * Walks the TLV region to parse known tags (unknown tags are skipped).
 * Returns the payload without the trailer and the parsed metadata,
 * or `undefined` if no valid trailer is found.
 */
export function extractPacketTrailer(frameData: ArrayBuffer): PacketTrailerInfo | undefined {
  const bytes = new Uint8Array(frameData);
  if (bytes.byteLength < PACKET_TRAILER_ENVELOPE_SIZE) {
    return undefined;
  }

  // Check magic bytes at the very end of the frame.
  const magicStart = bytes.byteLength - PACKET_TRAILER_MAGIC.length;
  for (let i = 0; i < PACKET_TRAILER_MAGIC.length; i++) {
    if (bytes[magicStart + i] !== PACKET_TRAILER_MAGIC[i]) {
      return undefined;
    }
  }

  const trailerLen = (bytes[bytes.byteLength - 5] ?? 0) ^ 0xff;

  if (trailerLen < PACKET_TRAILER_ENVELOPE_SIZE || trailerLen > bytes.byteLength) {
    return undefined;
  }

  const trailerStart = bytes.byteLength - trailerLen;
  const tlvEnd = bytes.byteLength - PACKET_TRAILER_ENVELOPE_SIZE;
  const view = new DataView(frameData);

  let timestampUs: number | undefined;
  let frameId: number | undefined;
  let pos = trailerStart;

  while (pos + 2 <= tlvEnd) {
    const tag = (bytes[pos] ?? 0) ^ 0xff;
    const len = (bytes[pos + 1] ?? 0) ^ 0xff;
    pos += 2;

    if (pos + len > tlvEnd) {
      break;
    }

    if (tag === TAG_TIMESTAMP_US && len === 8) {
      const high = view.getUint32(pos) ^ 0xffffffff;
      const low = view.getUint32(pos + 4) ^ 0xffffffff;
      timestampUs = high * 0x100000000 + low;
    } else if (tag === TAG_FRAME_ID && len === 4) {
      frameId = view.getUint32(pos) ^ 0xffffffff;
    }

    pos += len;
  }

  if (timestampUs === undefined) {
    return undefined;
  }

  const payload = frameData.slice(0, trailerStart);
  return { payload, timestampUs, frameId };
}

/**
 * Strips an LKTS trailer from an RTCEncodedVideoFrame in-place.
 * Replaces `encodedFrame.data` with the payload (trailer removed).
 *
 * @returns The extracted packet trailer metadata and the frame's RTP timestamp,
 *          or `undefined` if no trailer was found.
 */
export function stripPacketTrailerFromEncodedFrame(
  encodedFrame: RTCEncodedVideoFrame,
): PacketTrailerWithRtp | undefined {
  const info = extractPacketTrailer(encodedFrame.data);
  if (!info) {
    return undefined;
  }
  encodedFrame.data = info.payload;
  // getMetadata().rtpTimestamp is the 32-bit RTP timestamp (90 kHz clock for
  // video) that matches getSynchronizationSources().rtpTimestamp on the
  // receiver side.  encodedFrame.timestamp is a different value (microseconds).
  const meta = encodedFrame.getMetadata();
  const rtpTimestamp = (meta as Record<string, unknown>).rtpTimestamp as number | undefined;
  return { timestampUs: info.timestampUs, frameId: info.frameId, rtpTimestamp: rtpTimestamp ?? 0 };
}
