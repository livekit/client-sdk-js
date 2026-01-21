import { WrapAroundUnsignedInt, U16_MAX_SIZE, DataTrackHandle, DataTrackTimestamp } from "../utils";

import Serializable from "./serializable";
import { DataTrackExtensions } from "./extensions";
import { BASE_HEADER_LEN, EXT_WORDS_INDICATOR_SIZE, SUPPORTED_VERSION, VERSION_SHIFT, FRAME_MARKER_FINAL, FRAME_MARKER_INTER, FRAME_MARKER_SHIFT, FRAME_MARKER_START, FRAME_MARKER_SINGLE, EXT_FLAG_SHIFT } from "./constants";

/** A class for serializing / deserializing data track packet header sections. */
export class DataTrackPacketHeader extends Serializable {
  marker: FrameMarker;
  trackHandle: DataTrackHandle;
  sequence: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>;
  frameNumber: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>;
  timestamp: DataTrackTimestamp<90_000>;
  extensions: DataTrackExtensions;

  constructor(opts: {
    marker: FrameMarker,
    trackHandle: DataTrackHandle,
    sequence: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>,
    frameNumber: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>,
    timestamp: DataTrackTimestamp<90_000>,
    extensions?: DataTrackExtensions,
  }) {
    super();
    this.marker = opts.marker;
    this.trackHandle = opts.trackHandle;
    this.sequence = opts.sequence;
    this.frameNumber = opts.frameNumber;
    this.timestamp = opts.timestamp;
    this.extensions = opts.extensions ?? new DataTrackExtensions();
  }

  private extensionsMetrics() {
    const lengthBytes = this.extensions.toBinaryLengthBytes();
    const lengthWords = Math.ceil(lengthBytes / 4);
    const paddingLengthBytes = (lengthWords * 4) - lengthBytes;

    return { lengthBytes, lengthWords, paddingLengthBytes };
  }

  toBinaryLengthBytes() {
    const { lengthBytes: extLengthBytes, paddingLengthBytes: extPaddingLengthBytes } = this.extensionsMetrics();

    let totalLengthBytes = BASE_HEADER_LEN;
    if (extLengthBytes > 0) {
      totalLengthBytes += EXT_WORDS_INDICATOR_SIZE + extLengthBytes + extPaddingLengthBytes;
    }
    return totalLengthBytes;
  }

  toBinaryInto(dataView: DataView): number {
    let initial = SUPPORTED_VERSION << VERSION_SHIFT;

    let marker;
    switch (this.marker) {
      case FrameMarker.Inter:
        marker = FRAME_MARKER_INTER;
        break;
      case FrameMarker.Final:
        marker = FRAME_MARKER_FINAL;
        break;
      case FrameMarker.Start:
        marker = FRAME_MARKER_START;
        break;
      case FrameMarker.Single:
        marker = FRAME_MARKER_SINGLE;
        break;
    }
    initial |= marker << FRAME_MARKER_SHIFT;

    const {
      lengthBytes: extensionsLengthBytes,
      lengthWords: extensionsLengthWords,
      paddingLengthBytes: extensionsPaddingLengthBytes,
    } = this.extensionsMetrics();

    if (extensionsLengthBytes > 0) {
      initial |= 1 << EXT_FLAG_SHIFT;
    }

    let byteIndex = 0;
    dataView.setUint8(byteIndex, initial);
    byteIndex += 1;
    dataView.setUint8(byteIndex, 0); // Reserved
    byteIndex += 1;

    dataView.setUint16(byteIndex, this.trackHandle.value);
    byteIndex += 2;
    dataView.setUint16(byteIndex, this.sequence.value);
    byteIndex += 2;
    dataView.setUint16(byteIndex, this.frameNumber.value);
    byteIndex += 2;
    dataView.setUint32(byteIndex, this.timestamp.asTicks());
    byteIndex += 4;

    if (extensionsLengthBytes > 0) {
      dataView.setUint16(byteIndex, extensionsLengthWords);
      byteIndex += 2;
      const extensionBytes = this.extensions.toBinaryInto(new DataView(dataView.buffer, dataView.byteOffset + byteIndex));
      byteIndex += extensionBytes;
      for (let i = 0; i < extensionsPaddingLengthBytes; i += 1) {
        dataView.setUint8(byteIndex, 0);
        byteIndex += 1;
      }
    }

    const totalLengthBytes = this.toBinaryLengthBytes();
    if (byteIndex !== totalLengthBytes) {
      throw new Error(`DataTrackPacketHeader.toBinaryInto: Wrote ${byteIndex} bytes but expected length was ${totalLengthBytes} bytes`);
    }

    return totalLengthBytes;
  }

  toBinary() {
    const lengthBytes = this.toBinaryLengthBytes();
    const output = new ArrayBuffer(lengthBytes);
    const view = new DataView(output);

    const writtenBytes = this.toBinaryInto(view);

    if (lengthBytes !== writtenBytes) {
      throw new Error(`DataTrackPacketHeader.toBinary: written bytes (${writtenBytes} bytes) not equal to allocated array buffer length (${lengthBytes} bytes).`);
    }

    return new Uint8Array(output); // FIXME: return uint8array here? Or the arraybuffer?
  }

  toJSON() {
    return {
      marker: FrameMarker[this.marker],
      trackHandle: this.trackHandle.value,
      sequence: this.sequence.value,
      frameNumber: this.frameNumber.value,
      timestamp: this.timestamp.timestamp,
      extensions: this.extensions.toJSON(),
    };
  }
}

/** Marker indicating a packet's position in relation to a frame. */
export enum FrameMarker {
  /** Packet is the first in a frame. */
  Start = 0,
  /** Packet is within a frame. */
  Inter = 1,
  /** Packet is the last in a frame. */
  Final = 2,
  /** Packet is the only one in a frame. */
  Single = 3,
}

/** A class for serializing / deserializing data track packets. */
export class DataTrackPacket extends Serializable {
  header: DataTrackPacketHeader;
  payload: ArrayBuffer;

  constructor(header: DataTrackPacketHeader, payload: ArrayBuffer) {
    super();
    this.header = header;
    this.payload = payload;
  }

  toBinaryLengthBytes() {
    return this.header.toBinaryLengthBytes() + this.payload.byteLength;
  }

  toBinaryInto(dataView: DataView): number {
    let byteIndex = 0;
    const headerLengthBytes = this.header.toBinaryInto(dataView);
    byteIndex += headerLengthBytes;

    const payloadBytes = new Uint8Array(this.payload);
    for (let index = 0; index < payloadBytes.length; index += 1) {
      dataView.setUint8(byteIndex, payloadBytes[index]);
      byteIndex += 1;
    }

    const totalLengthBytes = this.toBinaryLengthBytes();
    if (byteIndex !== totalLengthBytes) {
      throw new Error(`DataTrackPacket.toBinaryInto: Wrote ${byteIndex} bytes but expected length was ${totalLengthBytes} bytes`);
    }

    return totalLengthBytes;
  }

  toJSON() {
    return { header: this.header.toJSON(), payload: this.payload };
  }
}
