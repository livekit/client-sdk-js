/**
 * Utilities for parsing LiveKit user timestamp (LKTS) trailers from encoded
 * video frames on the receive side.
 *
 * Trailer format (matches rust-sdks user_timestamp.h):
 *   - 8-byte big-endian int64 timestamp in microseconds since Unix epoch
 *   - 4-byte ASCII magic "LKTS"
 *
 * Total trailer size: 12 bytes.
 */

export interface UserTimestampInfo {
  /** Frame payload with the LKTS trailer removed. */
  payload: ArrayBuffer;
  /** Embedded user timestamp in microseconds since Unix epoch. */
  timestampUs: number;
}

export interface UserTimestampWithRtp {
  /** Embedded user timestamp in microseconds since Unix epoch. */
  timestampUs: number;
  /** RTP timestamp from the encoded frame (90 kHz clock for video). */
  rtpTimestamp: number;
}

/** ASCII bytes for 'L', 'K', 'T', 'S'. */
export const USER_TS_MAGIC = Uint8Array.from([0x4c, 0x4b, 0x54, 0x53]);
export const USER_TS_TRAILER_SIZE = 8 + USER_TS_MAGIC.length; // 12

/**
 * Extracts an LKTS trailer from the end of an encoded frame, if present.
 * Returns the payload without the trailer and the parsed timestamp,
 * or `undefined` if no valid trailer is found.
 */
export function extractUserTimestampTrailer(frameData: ArrayBuffer): UserTimestampInfo | undefined {
  const bytes = new Uint8Array(frameData);
  if (bytes.byteLength < USER_TS_TRAILER_SIZE) {
    return undefined;
  }

  // Check magic bytes at the very end of the frame.
  const magicStart = bytes.byteLength - USER_TS_MAGIC.length;
  for (let i = 0; i < USER_TS_MAGIC.length; i++) {
    if (bytes[magicStart + i] !== USER_TS_MAGIC[i]) {
      return undefined;
    }
  }

  // Read the 8-byte big-endian int64 timestamp preceding the magic.
  const tsStart = bytes.byteLength - USER_TS_TRAILER_SIZE;
  const view = new DataView(frameData);
  const high = view.getUint32(tsStart);
  const low = view.getUint32(tsStart + 4);
  const timestampUs = high * 0x100000000 + low;

  const payload = frameData.slice(0, tsStart);
  return { payload, timestampUs };
}

/**
 * Strips an LKTS trailer from an RTCEncodedVideoFrame in-place.
 * Replaces `encodedFrame.data` with the payload (trailer removed).
 *
 * @returns The extracted user timestamp and the frame's RTP timestamp,
 *          or `undefined` if no trailer was found.
 */
export function stripUserTimestampFromEncodedFrame(
  encodedFrame: RTCEncodedVideoFrame,
): UserTimestampWithRtp | undefined {
  const info = extractUserTimestampTrailer(encodedFrame.data);
  if (!info) {
    return undefined;
  }
  encodedFrame.data = info.payload;
  // getMetadata().rtpTimestamp is the 32-bit RTP timestamp (90 kHz clock for
  // video) that matches getSynchronizationSources().rtpTimestamp on the
  // receiver side.  encodedFrame.timestamp is a different value (microseconds).
  const meta = encodedFrame.getMetadata();
  const rtpTimestamp = (meta as Record<string, unknown>).rtpTimestamp as number | undefined;
  return { timestampUs: info.timestampUs, rtpTimestamp: rtpTimestamp ?? 0 };
}
