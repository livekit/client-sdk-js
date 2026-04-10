export const GCM_TAG_LENGTH_BYTES = 16;

export const AV1_E2EE_METADATA_OBU_TYPE = 5; // OBU_METADATA

const AV1_E2EE_METADATA_MAGIC_0 = 0x4c; // 'L'
const AV1_E2EE_METADATA_MAGIC_1 = 0x4b; // 'K'
const AV1_E2EE_METADATA_VERSION = 1;

type ByteRange = { start: number; end: number };

export interface Av1EncryptionLayout {
  protectedRanges: ByteRange[];
  protectedLength: number;
  aadRanges: ByteRange[];
  aadLength: number;
  buildAAD: (data: Uint8Array) => Uint8Array;
  extractProtected: (data: Uint8Array) => Uint8Array;
  writeProtected: (target: Uint8Array, protectedBytes: Uint8Array) => void;
}

type Av1EncryptionLayoutBase = Omit<
  Av1EncryptionLayout,
  'buildAAD' | 'extractProtected' | 'writeProtected'
>;

type Av1LayoutParser = (data: Uint8Array) => Av1EncryptionLayoutBase | undefined;

function sumRanges(ranges: ByteRange[]): number {
  return ranges.reduce((sum, range) => sum + (range.end - range.start), 0);
}

function isValidRange(range: ByteRange, dataLength: number): boolean {
  return range.start >= 0 && range.end >= range.start && range.end <= dataLength;
}

function buildByteArrayFromRanges(data: Uint8Array, ranges: ByteRange[], totalLength: number) {
  const out = new Uint8Array(totalLength);
  let writeOffset = 0;
  for (const range of ranges) {
    out.set(data.subarray(range.start, range.end), writeOffset);
    writeOffset += range.end - range.start;
  }
  return out;
}

function writeByteArrayIntoRanges(
  target: Uint8Array,
  ranges: ByteRange[],
  source: Uint8Array,
  totalLength: number,
) {
  if (source.byteLength !== totalLength) {
    throw new Error(
      `Unexpected protected bytes length: ${source.byteLength}, expected ${totalLength}`,
    );
  }
  let readOffset = 0;
  for (const range of ranges) {
    const len = range.end - range.start;
    target.set(source.subarray(readOffset, readOffset + len), range.start);
    readOffset += len;
  }
}

function readLeb128(
  data: Uint8Array,
  offset: number,
): { value: number; length: number } | undefined {
  let value = 0;
  let shift = 0;
  let length = 0;

  // AV1 uses leb128 for sizes; in practice values fit in 32-bit.
  while (offset + length < data.length) {
    const byte = data[offset + length];
    // Avoid bitwise operations to prevent signed 32-bit overflow on malformed inputs.
    value += (byte & 0x7f) * 2 ** shift;
    length++;

    if ((byte & 0x80) === 0) {
      return { value, length };
    }

    shift += 7;
    // Cap to 5 bytes (35 bits) to avoid pathological input.
    if (length >= 5) return undefined;
  }

  return undefined;
}

function writeLeb128(value: number): Uint8Array {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid leb128 value: ${value}`);
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v & 0x7f);
  return Uint8Array.from(bytes);
}

function parseObuHeader(byte: number): {
  obuType: number;
  extensionFlag: boolean;
  hasSizeField: boolean;
} | null {
  // https://aomediacodec.github.io/av1-spec/#obu-header-syntax
  // forbidden_bit must be 0, reserved_1bit must be 0.
  if ((byte & 0x80) !== 0) return null;
  if ((byte & 0x01) !== 0) return null;

  const obuType = (byte & 0x78) >> 3; // 4-bit obu_type (0..15)
  const extensionFlag = (byte & 0x04) !== 0;
  const hasSizeField = (byte & 0x02) !== 0;
  return { obuType, extensionFlag, hasSizeField };
}

export interface Av1E2eeMetadata {
  keyIndex: number;
  iv: Uint8Array;
  tag: Uint8Array;
}

export function buildAv1E2eeMetadataObu(meta: Av1E2eeMetadata): Uint8Array {
  if (meta.iv.byteLength !== 12) {
    throw new Error(`Unexpected IV length: ${meta.iv.byteLength}, expected 12`);
  }
  if (meta.tag.byteLength !== GCM_TAG_LENGTH_BYTES) {
    throw new Error(
      `Unexpected auth tag length: ${meta.tag.byteLength}, expected ${GCM_TAG_LENGTH_BYTES}`,
    );
  }

  const payload = new Uint8Array(32);
  payload[0] = AV1_E2EE_METADATA_MAGIC_0;
  payload[1] = AV1_E2EE_METADATA_MAGIC_1;
  payload[2] = AV1_E2EE_METADATA_VERSION;
  payload[3] = meta.keyIndex & 0xff;
  payload.set(meta.iv, 4);
  payload.set(meta.tag, 16);

  // OBU header: forbidden=0, obu_type, extension_flag=0, has_size_field=1, reserved=0.
  const obuHeader = (AV1_E2EE_METADATA_OBU_TYPE << 3) | 0x02;
  const sizeField = writeLeb128(payload.byteLength);

  const out = new Uint8Array(1 + sizeField.byteLength + payload.byteLength);
  out[0] = obuHeader;
  out.set(sizeField, 1);
  out.set(payload, 1 + sizeField.byteLength);
  return out;
}

export function extractAv1E2eeMetadataObu(
  data: Uint8Array,
): { payload: Uint8Array; meta: Av1E2eeMetadata } | undefined {
  // We currently only support OBU streams where OBU size fields are present,
  // which is what Chromium uses for RTCEncodedVideoFrame.data with AV1.
  let offset = 0;
  while (offset < data.length) {
    const obuStart = offset;
    const header = parseObuHeader(data[offset]);
    if (!header) return undefined;

    const headerLen = 1 + (header.extensionFlag ? 1 : 0);
    if (offset + headerLen > data.length) return undefined;

    if (!header.hasSizeField) return undefined;
    const leb = readLeb128(data, offset + headerLen);
    if (!leb) return undefined;
    const payloadLen = leb.value;
    const sizeFieldLen = leb.length;

    const payloadStart = offset + headerLen + sizeFieldLen;
    const payloadEnd = payloadStart + payloadLen;
    if (payloadEnd > data.length) return undefined;

    const obuEnd = payloadEnd;

    if (
      header.obuType === AV1_E2EE_METADATA_OBU_TYPE &&
      obuEnd === data.length &&
      payloadLen === 32
    ) {
      const payload = data.subarray(payloadStart, payloadEnd);
      if (
        payload[0] !== AV1_E2EE_METADATA_MAGIC_0 ||
        payload[1] !== AV1_E2EE_METADATA_MAGIC_1 ||
        payload[2] !== AV1_E2EE_METADATA_VERSION
      ) {
        return undefined;
      }

      const keyIndex = payload[3];
      const iv = payload.subarray(4, 16);
      const tag = payload.subarray(16, 32);
      return {
        payload: data.subarray(0, obuStart),
        meta: { keyIndex, iv, tag },
      };
    }

    offset = obuEnd;
  }

  return undefined;
}

function shouldKeepFirstPayloadByteClear(obuType: number): boolean {
  // OBU_FRAME_HEADER (3) and OBU_FRAME (6) contain show_existing_frame and frame_type in the first payload byte.
  return obuType === 3 || obuType === 6;
}

function computeLayoutFromRtpPayload(
  data: Uint8Array,
): Omit<Av1EncryptionLayout, 'buildAAD' | 'extractProtected' | 'writeProtected'> | undefined {
  if (data.length < 2) return undefined;

  // https://datatracker.ietf.org/doc/html/draft-ietf-avtcore-rtp-av1 (Aggregation Header)
  // |Z|Y|W|N|0|0|0|
  // Z: continuation from previous packet
  // Y: last OBU continues in next packet
  // W: number of OBU elements in this packet (0 means "unknown" and length fields are present for all OBUs)
  // N: start of a new coded video sequence
  const aggregationHeader = data[0];
  // Reserved bits MUST be 0 in the AV1 RTP aggregation header. This also prevents
  // mis-detecting other payload formats (e.g. RTX OSN prefix) as AV1 RTP.
  if ((aggregationHeader & 0x07) !== 0) return undefined;
  const z = (aggregationHeader & 0x80) !== 0;
  const w = (aggregationHeader & 0x30) >> 4;

  const aadRanges: ByteRange[] = [{ start: 0, end: 1 }]; // keep aggregation header in the clear
  const protectedRanges: ByteRange[] = [];
  let protectedLength = 0;

  let offset = 1;
  let obuIndex = 0;
  while (offset < data.length) {
    const isLastObuElement = w > 0 ? obuIndex + 1 === w : false;

    let obuStart = offset;
    let obuEnd = data.length;

    if (!isLastObuElement) {
      const leb = readLeb128(data, offset);
      if (!leb) return undefined;
      const obuLen = leb.value;
      const lenFieldEnd = offset + leb.length;
      obuStart = lenFieldEnd;
      obuEnd = obuStart + obuLen;
      if (obuEnd > data.length) return undefined;

      // Keep the external length field bytes unencrypted so downstream parsers can find OBU boundaries.
      aadRanges.push({ start: offset, end: obuStart });
    }

    if (obuStart >= obuEnd) {
      offset = obuEnd;
      obuIndex++;
      if (w > 0 && obuIndex >= w) break;
      continue;
    }

    if (z && obuIndex === 0) {
      // The first OBU element in a packet with Z=1 does not begin with an OBU header (it is a continuation).
      // Without the header (and size fields), we cannot reliably preserve frame header bits for SFU keyframe
      // detection, so encrypt the entire element (excluding aggregation header and length fields).
      protectedRanges.push({ start: obuStart, end: obuEnd });
      protectedLength += obuEnd - obuStart;
      offset = obuEnd;
      obuIndex++;
      if (w > 0 && obuIndex >= w) break;
      continue;
    }

    const header = parseObuHeader(data[obuStart]);
    if (!header) return undefined;

    const headerLen = 1 + (header.extensionFlag ? 1 : 0);
    if (obuStart + headerLen > obuEnd) return undefined;

    let sizeFieldLen = 0;
    if (header.hasSizeField) {
      const lebInner = readLeb128(data, obuStart + headerLen);
      if (!lebInner) return undefined;
      sizeFieldLen = lebInner.length;
      if (obuStart + headerLen + sizeFieldLen > obuEnd) return undefined;
    }

    // Keep OBU header (and any extension/size fields) unencrypted.
    const prefixStart = obuStart;
    const prefixEnd = obuStart + headerLen + sizeFieldLen;
    if (prefixEnd > prefixStart) aadRanges.push({ start: prefixStart, end: prefixEnd });

    const payloadStart = prefixEnd;
    const payloadEnd = obuEnd;
    const payloadLen = payloadEnd - payloadStart;

    const clearPayloadPrefixLen = shouldKeepFirstPayloadByteClear(header.obuType)
      ? Math.min(1, payloadLen)
      : 0;

    if (clearPayloadPrefixLen > 0) {
      aadRanges.push({ start: payloadStart, end: payloadStart + clearPayloadPrefixLen });
    }

    const protectedStart = payloadStart + clearPayloadPrefixLen;
    if (protectedStart < payloadEnd) {
      protectedRanges.push({ start: protectedStart, end: payloadEnd });
      protectedLength += payloadEnd - protectedStart;
    }

    offset = obuEnd;
    obuIndex++;
    if (w > 0 && obuIndex >= w) break;
  }

  const aadLength = sumRanges(aadRanges);
  return { protectedRanges, protectedLength, aadRanges, aadLength };
}

function computeLayoutFromRtxPayload(
  data: Uint8Array,
): Omit<Av1EncryptionLayout, 'buildAAD' | 'extractProtected' | 'writeProtected'> | undefined {
  if (data.length < 3) return undefined;

  const inner = computeLayoutFromRtpPayload(data.subarray(2));
  if (!inner) return undefined;

  const aadRanges = [
    { start: 0, end: 2 },
    ...inner.aadRanges.map((r) => ({ start: r.start + 2, end: r.end + 2 })),
  ];
  const protectedRanges = inner.protectedRanges.map((r) => ({
    start: r.start + 2,
    end: r.end + 2,
  }));
  const aadLength = sumRanges(aadRanges);
  const protectedLength = sumRanges(protectedRanges);

  return { protectedRanges, protectedLength, aadRanges, aadLength };
}

function computeLayoutFromSizeFieldObuStream(
  data: Uint8Array,
): Omit<Av1EncryptionLayout, 'buildAAD' | 'extractProtected' | 'writeProtected'> | undefined {
  let offset = 0;
  const aadRanges: ByteRange[] = [];
  const protectedRanges: ByteRange[] = [];
  let protectedLength = 0;

  while (offset < data.length) {
    const header = parseObuHeader(data[offset]);
    if (!header) return undefined;

    const headerLen = 1 + (header.extensionFlag ? 1 : 0);
    if (offset + headerLen > data.length) return undefined;

    let sizeFieldLen = 0;
    let payloadLen = 0;
    if (header.hasSizeField) {
      const leb = readLeb128(data, offset + headerLen);
      if (!leb) return undefined;
      payloadLen = leb.value;
      sizeFieldLen = leb.length;
      if (offset + headerLen + sizeFieldLen + payloadLen > data.length) return undefined;
    } else {
      // Without a size field, the end of the OBU is not known without parsing bitstream syntax.
      // Treat the remainder as a single OBU and stop.
      payloadLen = data.length - (offset + headerLen);
      sizeFieldLen = 0;
    }

    const prefixStart = offset;
    const prefixEnd = offset + headerLen + sizeFieldLen;
    if (prefixEnd > prefixStart) aadRanges.push({ start: prefixStart, end: prefixEnd });

    const payloadStart = prefixEnd;
    const payloadEnd = payloadStart + payloadLen;
    const clearPayloadPrefixLen = shouldKeepFirstPayloadByteClear(header.obuType)
      ? Math.min(1, payloadLen)
      : 0;

    if (clearPayloadPrefixLen > 0) {
      aadRanges.push({ start: payloadStart, end: payloadStart + clearPayloadPrefixLen });
    }

    const protectedStart = payloadStart + clearPayloadPrefixLen;
    if (protectedStart < payloadEnd) {
      protectedRanges.push({ start: protectedStart, end: payloadEnd });
      protectedLength += payloadEnd - protectedStart;
    }

    offset = payloadEnd;
    if (!header.hasSizeField) break;
  }

  const aadLength = sumRanges(aadRanges);
  return { protectedRanges, protectedLength, aadRanges, aadLength };
}

function computeLayoutFromAnnexB(
  data: Uint8Array,
): Omit<Av1EncryptionLayout, 'buildAAD' | 'extractProtected' | 'writeProtected'> | undefined {
  let offset = 0;
  const aadRanges: ByteRange[] = [];
  const protectedRanges: ByteRange[] = [];
  let protectedLength = 0;

  while (offset < data.length) {
    const leb = readLeb128(data, offset);
    if (!leb) return undefined;

    const obuLen = leb.value;
    const lenFieldEnd = offset + leb.length;
    const obuStart = lenFieldEnd;
    const obuEnd = obuStart + obuLen;
    if (obuEnd > data.length) return undefined;

    // Keep the external length field bytes unencrypted so downstream parsers can find OBU boundaries.
    aadRanges.push({ start: offset, end: obuStart });

    if (obuLen === 0) {
      offset = obuEnd;
      continue;
    }

    const header = parseObuHeader(data[obuStart]);
    if (!header) return undefined;

    const headerLen = 1 + (header.extensionFlag ? 1 : 0);
    if (obuStart + headerLen > obuEnd) return undefined;

    let sizeFieldLen = 0;
    let payloadStart = obuStart + headerLen;
    if (header.hasSizeField) {
      const lebInner = readLeb128(data, payloadStart);
      if (!lebInner) return undefined;
      sizeFieldLen = lebInner.length;
      payloadStart += sizeFieldLen;
      if (payloadStart > obuEnd) return undefined;
    }

    // Keep OBU header (and any internal size field if present) unencrypted.
    const prefixStart = obuStart;
    const prefixEnd = obuStart + headerLen + sizeFieldLen;
    aadRanges.push({ start: prefixStart, end: prefixEnd });

    const payloadEnd = obuEnd;
    const payloadLen = payloadEnd - payloadStart;

    const clearPayloadPrefixLen = shouldKeepFirstPayloadByteClear(header.obuType)
      ? Math.min(1, payloadLen)
      : 0;

    if (clearPayloadPrefixLen > 0) {
      aadRanges.push({ start: payloadStart, end: payloadStart + clearPayloadPrefixLen });
    }

    const protectedStart = payloadStart + clearPayloadPrefixLen;
    if (protectedStart < payloadEnd) {
      protectedRanges.push({ start: protectedStart, end: payloadEnd });
      protectedLength += payloadEnd - protectedStart;
    }

    offset = obuEnd;
  }

  const aadLength = sumRanges(aadRanges);
  return { protectedRanges, protectedLength, aadRanges, aadLength };
}

export function computeAv1EncryptionLayout(data: Uint8Array): Av1EncryptionLayout | undefined {
  if (data.length === 0) return undefined;

  const firstByte = data[0];
  const looksLikeObuHeader = (firstByte & 0x80) === 0 && (firstByte & 0x01) === 0;
  const looksLikeRtpAggregationHeader = (firstByte & 0x07) === 0;

  const parsers: Av1LayoutParser[] = [];

  // Heuristic ordering to reduce false positives (e.g. interpreting OBU streams as RTX payloads).
  if (looksLikeObuHeader) {
    parsers.push(computeLayoutFromSizeFieldObuStream, computeLayoutFromAnnexB);
    if (looksLikeRtpAggregationHeader) parsers.push(computeLayoutFromRtpPayload);
    parsers.push(computeLayoutFromRtxPayload);
  } else if (looksLikeRtpAggregationHeader) {
    parsers.push(computeLayoutFromRtpPayload, computeLayoutFromRtxPayload);
    parsers.push(computeLayoutFromSizeFieldObuStream, computeLayoutFromAnnexB);
  } else {
    parsers.push(
      computeLayoutFromSizeFieldObuStream,
      computeLayoutFromAnnexB,
      computeLayoutFromRtpPayload,
      computeLayoutFromRtxPayload,
    );
  }

  for (const parse of parsers) {
    const layout = parse(data);
    if (!layout) continue;

    let ok = true;
    for (const range of layout.aadRanges) {
      if (!isValidRange(range, data.length)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (const range of layout.protectedRanges) {
      if (!isValidRange(range, data.length)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    return {
      ...layout,
      buildAAD: (src) => buildByteArrayFromRanges(src, layout.aadRanges, layout.aadLength),
      extractProtected: (src) =>
        buildByteArrayFromRanges(src, layout.protectedRanges, layout.protectedLength),
      writeProtected: (target, protectedBytes) =>
        writeByteArrayIntoRanges(
          target,
          layout.protectedRanges,
          protectedBytes,
          layout.protectedLength,
        ),
    };
  }

  return undefined;
}
