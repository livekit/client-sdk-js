export const PACKET_TRAILER_MAGIC = Uint8Array.from([
  'L'.charCodeAt(0),
  'K'.charCodeAt(0),
  'T'.charCodeAt(0),
  'S'.charCodeAt(0),
]);

export const PACKET_TRAILER_TIMESTAMP_TAG = 0x01;
export const PACKET_TRAILER_FRAME_ID_TAG = 0x02;
export const PACKET_TRAILER_ENVELOPE_SIZE = 5;

const TIMESTAMP_TLV_SIZE = 10;
const FRAME_ID_TLV_SIZE = 6;

export interface PacketTrailerMetadata {
  userTimestamp: number;
  frameId: number;
}

export interface ExtractPacketTrailerResult {
  data: Uint8Array;
  metadata?: PacketTrailerMetadata;
}

export function appendPacketTrailer(
  data: Uint8Array,
  userTimestamp: number,
  frameId: number,
): Uint8Array {
  const hasTimestamp = userTimestamp !== 0;
  const hasFrameId = frameId !== 0;

  if (!hasTimestamp && !hasFrameId) {
    return data;
  }

  const trailerLength =
    (hasTimestamp ? TIMESTAMP_TLV_SIZE : 0) +
    (hasFrameId ? FRAME_ID_TLV_SIZE : 0) +
    PACKET_TRAILER_ENVELOPE_SIZE;
  const result = new Uint8Array(data.length + trailerLength);
  let offset = 0;

  result.set(data, offset);
  offset += data.length;

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

export function extractPacketTrailer(data: ArrayBuffer | Uint8Array): ExtractPacketTrailerResult {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
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
  const trailerEnd = bytes.length - PACKET_TRAILER_ENVELOPE_SIZE;
  const strippedData = bytes.subarray(0, trailerStart);
  let offset = trailerStart;
  let foundAny = false;
  const metadata: PacketTrailerMetadata = {
    userTimestamp: 0,
    frameId: 0,
  };

  while (offset + 2 <= trailerEnd) {
    const tag = bytes[offset++] ^ 0xff;
    const length = bytes[offset++] ^ 0xff;

    if (offset + length > trailerEnd) {
      break;
    }

    if (tag === PACKET_TRAILER_TIMESTAMP_TAG && length === 8) {
      metadata.userTimestamp = readUint64Xor(bytes, offset, length);
      foundAny = true;
    } else if (tag === PACKET_TRAILER_FRAME_ID_TAG && length === 4) {
      metadata.frameId = readUint32Xor(bytes, offset, length);
      foundAny = true;
    }

    offset += length;
  }

  if (!foundAny) {
    return { data: bytes };
  }

  return { data: strippedData, metadata };
}

function matchesMagic(data: Uint8Array, offset: number) {
  for (let index = 0; index < PACKET_TRAILER_MAGIC.length; index += 1) {
    if (data[offset + index] !== PACKET_TRAILER_MAGIC[index]) {
      return false;
    }
  }
  return true;
}

function readUint64Xor(data: Uint8Array, offset: number, length: number) {
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = value * 256 + (data[offset + index] ^ 0xff);
  }
  return value;
}

function readUint32Xor(data: Uint8Array, offset: number, length: number) {
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = (value << 8) | (data[offset + index] ^ 0xff);
  }
  return value >>> 0;
}

function writeUint64Xor(target: Uint8Array, offset: number, value: number) {
  let remaining = value;
  for (let index = 7; index >= 0; index -= 1) {
    const shift = 256 ** index;
    const currentByte = Math.floor(remaining / shift);
    target[offset + (7 - index)] = currentByte ^ 0xff;
    remaining -= currentByte * shift;
  }
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
  return undefined;
}

export function getFrameSsrc(
  frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
): number {
  try {
    const metadata = frame.getMetadata() as Record<string, unknown>;
    if (typeof metadata.synchronizationSource === 'number') {
      return metadata.synchronizationSource;
    }
  } catch {}
  return 0;
}
