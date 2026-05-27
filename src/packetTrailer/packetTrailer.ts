import type { VideoCodec } from '../room/track/options';
import type { PacketTrailerMetadata, PacketTrailerPublishOptions } from './types';
import { hasPacketTrailerPublishOptions } from './utils';

export const PACKET_TRAILER_MAGIC = Uint8Array.from([
  'L'.charCodeAt(0),
  'K'.charCodeAt(0),
  'T'.charCodeAt(0),
  'S'.charCodeAt(0),
]);

export const PACKET_TRAILER_TIMESTAMP_TAG = 0x01;
export const PACKET_TRAILER_FRAME_ID_TAG = 0x02;
export const PACKET_TRAILER_ENVELOPE_SIZE = 5;
export const AV1_METADATA_TYPE_LIVEKIT_PACKET_TRAILER = 31;

const TIMESTAMP_TLV_SIZE = 10;
const FRAME_ID_TLV_SIZE = 6;
const AV1_OBU_SIZE_PRESENT_BIT = 0b0000_0010;
const AV1_OBU_EXTENSION_FLAG = 0b0000_0100;
const AV1_OBU_TYPE_MASK = 0b0111_1000;
const AV1_OBU_TYPE_SEQUENCE_HEADER = 1;
const AV1_OBU_TYPE_TEMPORAL_DELIMITER = 2;
const AV1_OBU_TYPE_METADATA = 5;

export interface ExtractPacketTrailerResult {
  data: Uint8Array;
  metadata?: PacketTrailerMetadata;
}

export function appendPacketTrailer(
  data: Uint8Array,
  userTimestamp: bigint,
  frameId: number,
  codec?: VideoCodec,
): Uint8Array {
  const trailer = buildPacketTrailerPayload(userTimestamp, frameId);
  if (!trailer) {
    return data;
  }

  if (codec === 'av1') {
    return appendAv1PacketTrailer(data, trailer);
  }

  const result = new Uint8Array(data.length + trailer.length);
  result.set(data);
  result.set(trailer, data.length);
  return result;
}

function buildPacketTrailerPayload(userTimestamp: bigint, frameId: number): Uint8Array | undefined {
  const hasTimestamp = userTimestamp !== BigInt(0);
  const hasFrameId = frameId !== 0;

  if (!hasTimestamp && !hasFrameId) {
    return undefined;
  }

  const trailerLength =
    (hasTimestamp ? TIMESTAMP_TLV_SIZE : 0) +
    (hasFrameId ? FRAME_ID_TLV_SIZE : 0) +
    PACKET_TRAILER_ENVELOPE_SIZE;
  const result = new Uint8Array(trailerLength);
  let offset = 0;

  if (hasTimestamp) {
    result[offset++] = PACKET_TRAILER_TIMESTAMP_TAG ^ 0xff;
    result[offset++] = 8 ^ 0xff;
    writeUint64Xor(result, offset, userTimestamp);
    offset += 8;
  }

  if (hasFrameId) {
    result[offset++] = PACKET_TRAILER_FRAME_ID_TAG ^ 0xff;
    result[offset++] = 4 ^ 0xff;
    writeUint32Xor(result, offset, frameId);
    offset += 4;
  }

  result[offset++] = trailerLength ^ 0xff;
  result.set(PACKET_TRAILER_MAGIC, offset);

  return result;
}

export function appendPacketTrailerToEncodedFrame(
  frame: RTCEncodedVideoFrame,
  options: PacketTrailerPublishOptions | undefined,
  frameId: number,
  codec?: VideoCodec,
): boolean {
  if (!hasPacketTrailerPublishOptions(options) || frame.data.byteLength === 0) {
    return false;
  }

  const userTimestamp = options?.timestamp ? BigInt(Date.now()) * BigInt(1000) : BigInt(0);
  const packetTrailerFrameId = options?.frameId ? frameId : 0;
  const data = new Uint8Array(frame.data);
  const result = appendPacketTrailer(data, userTimestamp, packetTrailerFrameId, codec);

  if (result.byteLength === data.byteLength) {
    return false;
  }

  frame.data = result.buffer.slice(
    result.byteOffset,
    result.byteOffset + result.byteLength,
  ) as ArrayBuffer;
  return true;
}

export function extractPacketTrailer(
  data: ArrayBuffer | Uint8Array,
  codec?: VideoCodec,
): ExtractPacketTrailerResult {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (codec === 'av1') {
    return extractAv1PacketTrailer(bytes);
  }

  if (bytes.length < PACKET_TRAILER_ENVELOPE_SIZE) {
    return { data: bytes };
  }

  const magicOffset = bytes.length - PACKET_TRAILER_MAGIC.length;
  if (!matchesMagic(bytes, magicOffset)) {
    return { data: bytes };
  }

  const trailerLength = bytes[bytes.length - PACKET_TRAILER_ENVELOPE_SIZE] ^ 0xff;
  if (trailerLength < PACKET_TRAILER_ENVELOPE_SIZE || trailerLength > bytes.length) {
    return { data: bytes };
  }

  const trailerStart = bytes.length - trailerLength;
  const metadata = parsePacketTrailerPayload(bytes.subarray(trailerStart));

  if (!metadata) {
    return { data: bytes };
  }

  return { data: bytes.subarray(0, trailerStart), metadata };
}

function parsePacketTrailerPayload(trailer: Uint8Array): PacketTrailerMetadata | undefined {
  if (trailer.length < PACKET_TRAILER_ENVELOPE_SIZE) {
    return undefined;
  }

  const magicOffset = trailer.length - PACKET_TRAILER_MAGIC.length;
  if (!matchesMagic(trailer, magicOffset)) {
    return undefined;
  }

  const trailerLength = trailer[trailer.length - PACKET_TRAILER_ENVELOPE_SIZE] ^ 0xff;
  if (trailerLength !== trailer.length || trailerLength < PACKET_TRAILER_ENVELOPE_SIZE) {
    return undefined;
  }

  const trailerEnd = trailer.length - PACKET_TRAILER_ENVELOPE_SIZE;
  let offset = 0;
  let foundAny = false;
  const metadata: PacketTrailerMetadata = {
    userTimestamp: BigInt(0),
    frameId: 0,
  };

  while (offset + 2 <= trailerEnd) {
    const tag = trailer[offset++] ^ 0xff;
    const length = trailer[offset++] ^ 0xff;

    if (offset + length > trailerEnd) {
      break;
    }

    if (tag === PACKET_TRAILER_TIMESTAMP_TAG && length === 8) {
      metadata.userTimestamp = readUint64Xor(trailer, offset);
      foundAny = true;
    } else if (tag === PACKET_TRAILER_FRAME_ID_TAG && length === 4) {
      metadata.frameId = readUint32Xor(trailer, offset, length);
      foundAny = true;
    }

    offset += length;
  }

  if (!foundAny) {
    return undefined;
  }

  return metadata;
}

function appendAv1PacketTrailer(data: Uint8Array, trailer: Uint8Array): Uint8Array {
  const obu = buildAv1MetadataObu(trailer);
  if (data.length === 0) {
    return obu;
  }

  const insertOffset = findAv1MetadataInsertOffset(data);
  const result = new Uint8Array(data.length + obu.length);
  result.set(data.subarray(0, insertOffset));
  result.set(obu, insertOffset);
  result.set(data.subarray(insertOffset), insertOffset + obu.length);
  return result;
}

function buildAv1MetadataObu(trailer: Uint8Array): Uint8Array {
  const metadataType = writeLeb128(AV1_METADATA_TYPE_LIVEKIT_PACKET_TRAILER);
  const metadataPayload = new Uint8Array(metadataType.length + trailer.length);
  metadataPayload.set(metadataType);
  metadataPayload.set(trailer, metadataType.length);

  const payloadSize = writeLeb128(metadataPayload.length);
  const obu = new Uint8Array(1 + payloadSize.length + metadataPayload.length);
  let offset = 0;
  obu[offset++] = (AV1_OBU_TYPE_METADATA << 3) | AV1_OBU_SIZE_PRESENT_BIT;
  obu.set(payloadSize, offset);
  offset += payloadSize.length;
  obu.set(metadataPayload, offset);
  return obu;
}

function findAv1MetadataInsertOffset(data: Uint8Array): number {
  let pos = 0;
  let insertOffset = 0;

  while (pos < data.length) {
    const obuStart = pos;
    const obuHeader = data[pos++];
    if ((obuHeader & 0x80) !== 0) {
      return 0;
    }

    const obuType = (obuHeader & AV1_OBU_TYPE_MASK) >> 3;
    if ((obuHeader & AV1_OBU_EXTENSION_FLAG) !== 0) {
      if (pos >= data.length) {
        return 0;
      }
      pos += 1;
    }

    let payloadSize = data.length - pos;
    if ((obuHeader & AV1_OBU_SIZE_PRESENT_BIT) !== 0) {
      const leb = readLeb128(data, pos);
      if (!leb || leb.value > data.length - leb.offset) {
        return 0;
      }
      pos = leb.offset;
      payloadSize = leb.value;
    }

    const obuEnd = pos + payloadSize;
    if (obuType === AV1_OBU_TYPE_TEMPORAL_DELIMITER) {
      pos = obuEnd;
      continue;
    }

    if (obuType !== AV1_OBU_TYPE_SEQUENCE_HEADER) {
      break;
    }

    insertOffset = obuEnd;
    pos = obuEnd;

    if ((data[obuStart] & AV1_OBU_SIZE_PRESENT_BIT) === 0) {
      break;
    }
  }

  return insertOffset;
}

function extractAv1PacketTrailer(data: Uint8Array): ExtractPacketTrailerResult {
  const strippedChunks: Uint8Array[] = [];
  let strippedLength = 0;
  let pos = 0;

  while (pos < data.length) {
    const obuStart = pos;
    const obuHeader = data[pos++];
    if ((obuHeader & 0x80) !== 0) {
      return { data };
    }

    const obuType = (obuHeader & AV1_OBU_TYPE_MASK) >> 3;
    if ((obuHeader & AV1_OBU_EXTENSION_FLAG) !== 0) {
      if (pos >= data.length) {
        return { data };
      }
      pos += 1;
    }

    let payloadSize = data.length - pos;
    if ((obuHeader & AV1_OBU_SIZE_PRESENT_BIT) !== 0) {
      const leb = readLeb128(data, pos);
      if (!leb || leb.value > data.length - leb.offset) {
        return { data };
      }
      pos = leb.offset;
      payloadSize = leb.value;
    }

    const payloadStart = pos;
    const obuEnd = payloadStart + payloadSize;

    if (obuType === AV1_OBU_TYPE_METADATA) {
      const metadataPayload = data.subarray(payloadStart, obuEnd);
      const metadataType = readLeb128(metadataPayload, 0);
      if (
        metadataType &&
        metadataType.value === AV1_METADATA_TYPE_LIVEKIT_PACKET_TRAILER &&
        metadataType.offset <= metadataPayload.length
      ) {
        const metadata = parsePacketTrailerPayload(metadataPayload.subarray(metadataType.offset));
        if (metadata) {
          const remaining = data.subarray(obuEnd);
          strippedChunks.push(remaining);
          strippedLength += remaining.length;
          return { data: concatUint8Arrays(strippedChunks, strippedLength), metadata };
        }
      }
    }

    const chunk = data.subarray(obuStart, obuEnd);
    strippedChunks.push(chunk);
    strippedLength += chunk.length;
    pos = obuEnd;
  }

  return { data };
}

function concatUint8Arrays(chunks: Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function writeLeb128(value: number): Uint8Array {
  const bytes: number[] = [];
  let remaining = value;
  do {
    let byte = remaining & 0x7f;
    remaining = Math.floor(remaining / 0x80);
    if (remaining > 0) {
      byte |= 0x80;
    }
    bytes.push(byte);
  } while (remaining > 0);

  return Uint8Array.from(bytes);
}

function readLeb128(
  data: Uint8Array,
  offset: number,
): { value: number; offset: number } | undefined {
  let value = 0;
  let multiplier = 1;
  let pos = offset;

  for (let bytes = 0; bytes < 8; bytes += 1) {
    if (pos >= data.length) {
      return undefined;
    }

    const byte = data[pos++];
    value += (byte & 0x7f) * multiplier;
    if (value > Number.MAX_SAFE_INTEGER) {
      return undefined;
    }
    if ((byte & 0x80) === 0) {
      return { value, offset: pos };
    }
    multiplier *= 0x80;
  }

  return undefined;
}

function matchesMagic(data: Uint8Array, offset: number) {
  for (let index = 0; index < PACKET_TRAILER_MAGIC.length; index += 1) {
    if (data[offset + index] !== PACKET_TRAILER_MAGIC[index]) {
      return false;
    }
  }
  return true;
}

function readUint64Xor(data: Uint8Array, offset: number): bigint {
  const hi = BigInt(
    (((data[offset] ^ 0xff) << 24) |
      ((data[offset + 1] ^ 0xff) << 16) |
      ((data[offset + 2] ^ 0xff) << 8) |
      (data[offset + 3] ^ 0xff)) >>>
      0,
  );
  const lo = BigInt(
    (((data[offset + 4] ^ 0xff) << 24) |
      ((data[offset + 5] ^ 0xff) << 16) |
      ((data[offset + 6] ^ 0xff) << 8) |
      (data[offset + 7] ^ 0xff)) >>>
      0,
  );
  return (hi << BigInt(32)) | lo;
}

function readUint32Xor(data: Uint8Array, offset: number, length: number) {
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = (value << 8) | (data[offset + index] ^ 0xff);
  }
  return value >>> 0;
}

function writeUint64Xor(target: Uint8Array, offset: number, value: bigint) {
  const hi = Number((value >> BigInt(32)) & BigInt(0xffffffff));
  const lo = Number(value & BigInt(0xffffffff));
  target[offset] = (hi >>> 24) ^ 0xff;
  target[offset + 1] = ((hi >>> 16) & 0xff) ^ 0xff;
  target[offset + 2] = ((hi >>> 8) & 0xff) ^ 0xff;
  target[offset + 3] = (hi & 0xff) ^ 0xff;
  target[offset + 4] = (lo >>> 24) ^ 0xff;
  target[offset + 5] = ((lo >>> 16) & 0xff) ^ 0xff;
  target[offset + 6] = ((lo >>> 8) & 0xff) ^ 0xff;
  target[offset + 7] = (lo & 0xff) ^ 0xff;
}

function writeUint32Xor(target: Uint8Array, offset: number, value: number) {
  for (let index = 3; index >= 0; index -= 1) {
    target[offset + (3 - index)] = ((value >> (index * 8)) & 0xff) ^ 0xff;
  }
}

export function getFrameRtpTimestamp(
  frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
): number | undefined {
  try {
    const metadata = frame.getMetadata() as Record<string, unknown>;
    if (typeof metadata.rtpTimestamp === 'number') {
      return metadata.rtpTimestamp;
    }
    if (typeof metadata.timestamp === 'number') {
      return metadata.timestamp;
    }
  } catch {
    // getMetadata() might not be available
  }
  if (typeof frame.timestamp === 'number') {
    return frame.timestamp;
  }
  return undefined;
}

export function getFrameSsrc(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): number {
  try {
    const metadata = frame.getMetadata() as Record<string, unknown>;
    if (typeof metadata.synchronizationSource === 'number') {
      return metadata.synchronizationSource;
    }
  } catch {}
  return 0;
}

export interface PacketTrailerFramePayload {
  trackId: string;
  rtpTimestamp: number;
  ssrc: number;
  metadata: PacketTrailerMetadata;
}

export interface ProcessPacketTrailerResult {
  data?: ArrayBuffer;
  payload?: PacketTrailerFramePayload;
}

/**
 * Extracts a packet trailer from an encoded frame and returns the stripped
 * frame data (if any) along with a ready-to-post metadata payload. Returns an
 * empty object when no trailer is present, an RTP timestamp can't be read, or
 * a trackId isn't available.
 */
export function processPacketTrailer(
  frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
  trackId: string | undefined,
  codec?: VideoCodec,
): ProcessPacketTrailerResult {
  if (frame.data.byteLength === 0) {
    return {};
  }

  const result = extractPacketTrailer(frame.data, codec);
  if (!result.metadata) {
    return {};
  }

  const strippedData = (result.data.buffer as ArrayBuffer).slice(
    result.data.byteOffset,
    result.data.byteOffset + result.data.byteLength,
  );

  const rtpTimestamp = getFrameRtpTimestamp(frame);
  if (rtpTimestamp === undefined || !trackId) {
    return { data: strippedData };
  }

  return {
    data: strippedData,
    payload: {
      trackId,
      rtpTimestamp,
      ssrc: getFrameSsrc(frame),
      metadata: result.metadata,
    },
  };
}
