import type { Throws } from 'throws-transformer/src/throws';
import { DataTrackHandle, DataTrackHandleError, DataTrackHandleErrorReason } from '../handle';
import { DataTrackTimestamp, U16_MAX_SIZE, WrapAroundUnsignedInt } from '../utils';
import {
  BASE_HEADER_LEN,
  EXT_FLAG_MASK,
  EXT_FLAG_SHIFT,
  EXT_WORDS_INDICATOR_SIZE,
  FRAME_MARKER_FINAL,
  FRAME_MARKER_INTER,
  FRAME_MARKER_MASK,
  FRAME_MARKER_SHIFT,
  FRAME_MARKER_SINGLE,
  FRAME_MARKER_START,
  SUPPORTED_VERSION,
  VERSION_MASK,
  VERSION_SHIFT,
} from './constants';
import { DataTrackDeserializeError, DataTrackDeserializeErrorReason } from './errors';
import { DataTrackExtensions } from './extensions';
import Serializable from './serializable';

/** A class for serializing / deserializing data track packet header sections. */
export class DataTrackPacketHeader extends Serializable {
  marker: FrameMarker;

  trackHandle: DataTrackHandle;

  sequence: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>;

  frameNumber: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>;

  timestamp: DataTrackTimestamp<90_000>;

  extensions: DataTrackExtensions;

  constructor(opts: {
    marker: FrameMarker;
    trackHandle: DataTrackHandle;
    sequence: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>;
    frameNumber: WrapAroundUnsignedInt<typeof U16_MAX_SIZE>;
    timestamp: DataTrackTimestamp<90_000>;
    extensions?: DataTrackExtensions;
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
    const paddingLengthBytes = lengthWords * 4 - lengthBytes;

    return { lengthBytes, lengthWords, paddingLengthBytes };
  }

  toBinaryLengthBytes() {
    const { lengthBytes: extLengthBytes, paddingLengthBytes: extPaddingLengthBytes } =
      this.extensionsMetrics();

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
      const extensionBytes = this.extensions.toBinaryInto(
        new DataView(dataView.buffer, dataView.byteOffset + byteIndex),
      );
      byteIndex += extensionBytes;
      for (let i = 0; i < extensionsPaddingLengthBytes; i += 1) {
        dataView.setUint8(byteIndex, 0);
        byteIndex += 1;
      }
    }

    const totalLengthBytes = this.toBinaryLengthBytes();
    if (byteIndex !== totalLengthBytes) {
      throw new Error(
        `DataTrackPacketHeader.toBinaryInto: Wrote ${byteIndex} bytes but expected length was ${totalLengthBytes} bytes`,
      );
    }

    return totalLengthBytes;
  }

  static fromBinary<Input extends DataView | ArrayBuffer | Uint8Array>(
    input: Input,
  ): Throws<
    [header: DataTrackPacketHeader, byteLength: number],
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.TooShort>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.HeaderOverrun>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.MissingExtWords>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.UnsupportedVersion>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.InvalidHandle>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.MalformedExt>
  > {
    const dataView =
      input instanceof DataView
        ? input
        : new DataView(input instanceof ArrayBuffer ? input : input.buffer);

    if (dataView.byteLength < BASE_HEADER_LEN) {
      throw DataTrackDeserializeError.tooShort();
    }

    let byteIndex = 0;

    const initial = dataView.getUint8(byteIndex);
    byteIndex += 1;

    const version = (initial >> VERSION_SHIFT) & VERSION_MASK;
    if (version > SUPPORTED_VERSION) {
      throw DataTrackDeserializeError.unsupportedVersion(version);
    }

    let marker;
    switch ((initial >> FRAME_MARKER_SHIFT) & FRAME_MARKER_MASK) {
      case FRAME_MARKER_START:
        marker = FrameMarker.Start;
        break;
      case FRAME_MARKER_FINAL:
        marker = FrameMarker.Final;
        break;
      case FRAME_MARKER_SINGLE:
        marker = FrameMarker.Single;
        break;
      case FRAME_MARKER_INTER:
      default:
        marker = FrameMarker.Inter;
        break;
    }

    const extensionsFlag = ((initial >> EXT_FLAG_SHIFT) & EXT_FLAG_MASK) > 0;

    byteIndex += 1; // Reserved

    let trackHandle: DataTrackHandle | undefined;
    try {
      trackHandle = DataTrackHandle.fromNumber(dataView.getUint16(byteIndex));
    } catch (e) {
      if (
        e instanceof DataTrackHandleError &&
        (e.isReason(DataTrackHandleErrorReason.Reserved) ||
          e.isReason(DataTrackHandleErrorReason.TooLarge))
      ) {
        throw DataTrackDeserializeError.invalidHandle(e);
      } else {
        throw e;
      }
    }
    byteIndex += 2;

    const sequence = WrapAroundUnsignedInt.u16(dataView.getUint16(byteIndex));
    byteIndex += 2;

    const frameNumber = WrapAroundUnsignedInt.u16(dataView.getUint16(byteIndex));
    byteIndex += 2;

    const timestamp = DataTrackTimestamp.fromRtpTicks(dataView.getUint32(byteIndex));
    byteIndex += 4;

    let extensions = new DataTrackExtensions();
    if (extensionsFlag) {
      if (dataView.byteLength - byteIndex < 2) {
        throw DataTrackDeserializeError.missingExtWords();
      }
      let extensionWords = dataView.getUint16(byteIndex);
      byteIndex += 1;

      let extensionLengthBytes = 4 * extensionWords;
      if (extensionLengthBytes > dataView.byteLength - byteIndex) {
        throw DataTrackDeserializeError.headerOverrun();
      }
      let extensionDataView = new DataView(
        dataView.buffer,
        dataView.byteOffset + (byteIndex + 1),
        extensionLengthBytes,
      );

      const [result, readBytes] = DataTrackExtensions.fromBinary(extensionDataView);
      extensions = result;
      byteIndex += readBytes;
    }

    return [
      new DataTrackPacketHeader({
        marker,
        trackHandle: trackHandle!,
        sequence,
        frameNumber,
        timestamp,
        extensions,
      }),
      byteIndex,
    ];
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
      throw new Error(
        `DataTrackPacket.toBinaryInto: Wrote ${byteIndex} bytes but expected length was ${totalLengthBytes} bytes`,
      );
    }

    return totalLengthBytes;
  }

  static fromBinary<Input extends DataView | ArrayBuffer | Uint8Array>(
    input: Input,
  ): Throws<
    [packet: DataTrackPacket, byteLength: number],
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.TooShort>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.HeaderOverrun>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.MissingExtWords>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.UnsupportedVersion>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.InvalidHandle>
    | DataTrackDeserializeError<DataTrackDeserializeErrorReason.MalformedExt>
  > {
    const dataView =
      input instanceof DataView
        ? input
        : new DataView(input instanceof ArrayBuffer ? input : input.buffer);

    const [header, headerByteLength] = DataTrackPacketHeader.fromBinary(dataView);

    const payload = dataView.buffer.slice(
      dataView.byteOffset + headerByteLength + 1,
      dataView.byteLength,
    );

    return [new DataTrackPacket(header, payload), dataView.byteLength] as [DataTrackPacket, number];
  }

  toJSON() {
    return { header: this.header.toJSON(), payload: this.payload };
  }
}
