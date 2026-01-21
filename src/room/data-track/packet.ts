import { WrapAroundUnsignedInt, U16_MAX_SIZE, DataTrackHandle, DataTrackTimestamp, DataTrackHandleAllocator } from "./utils";
import { BASE_HEADER_LEN, EXT_WORDS_INDICATOR_SIZE, SUPPORTED_VERSION, VERSION_SHIFT, FRAME_MARKER_FINAL, FRAME_MARKER_INTER, FRAME_MARKER_SHIFT, FRAME_MARKER_START, FRAME_MARKER_SINGLE, EXT_FLAG_SHIFT } from "./constants";

/** An abstract class implementing common behavior related to data track binary serialization. */
abstract class Serializable {
  /** Returns the expected length of the serialized output in bytes */
  abstract toBinaryLengthBytes(): number;

  /** Given a DataView, serialize the instance inside and return the number of bytes written. */
  abstract toBinaryInto(dataView: DataView): number;

  /** Encodes the instance as binary and returns the data as a Uint8Array. */
  toBinary() {
    const lengthBytes = this.toBinaryLengthBytes();
    const output = new ArrayBuffer(lengthBytes);
    const view = new DataView(output);

    const writtenBytes = this.toBinaryInto(view);

    if (lengthBytes !== writtenBytes) {
      throw new Error(`${this.constructor.name}.toBinary: written bytes (${writtenBytes} bytes) not equal to allocated array buffer length (${lengthBytes} bytes).`);
    }

    return new Uint8Array(output); // FIXME: return uint8array here? Or the arraybuffer?
  }
}

enum DataTrackExtensionTag {
  UserTimestamp = 2,
  E2ee = 1,
}

abstract class DataTrackExtension extends Serializable {
  abstract tag: DataTrackExtensionTag;
  abstract lengthBytes: number;

  toBinaryLengthBytes(): number {
    return this.lengthBytes;
  }
}

export class UserTimestampExtension extends DataTrackExtension {
  tag = DataTrackExtensionTag.UserTimestamp;
  lengthBytes = 8;

  private timestamp: bigint;

  private constructor(timestamp: bigint) {
    super();
    this.timestamp = timestamp;
  }

  toBinaryInto(dataView: DataView) {
    let byteIndex = 0;

    dataView.setUint16(byteIndex, this.tag);
    byteIndex += 2;

    dataView.setUint16(byteIndex, this.lengthBytes - 1);
    byteIndex += 2;

    dataView.setBigUint64(byteIndex, this.timestamp);
    byteIndex += 8;

    return byteIndex;
  }

  toJSON() {
    return {
      tag: this.tag,
      lengthBytes: this.lengthBytes,

      timestamp: this.timestamp,
    };
  }
}

export class E2eeExtExtension extends DataTrackExtension {
  tag = DataTrackExtensionTag.E2ee;
  lengthBytes = 13;

  private keyIndex: number;
  private iv: Uint8Array; /* NOTE: According to the rust implementation, this should be 12 bytes long. */

  private constructor(keyIndex: number, iv: Uint8Array) {
    super();
    this.keyIndex = keyIndex;
    this.iv = iv;
  }

  toBinaryInto(dataView: DataView) {
    let byteIndex = 0;

    dataView.setUint16(byteIndex, this.tag);
    byteIndex += 2;

    dataView.setUint16(byteIndex, this.lengthBytes - 1);
    byteIndex += 2;

    dataView.setUint8(byteIndex, this.keyIndex);
    byteIndex += 1;

    for (let i = 0; i < this.iv.length; i += 1) {
      dataView.setUint8(byteIndex, this.iv[i]);
      byteIndex += 1;
    }

    return byteIndex;
  }

  toJSON() {
    return {
      tag: this.tag,
      lengthBytes: this.lengthBytes,

      keyIndex: this.keyIndex,
      iv: this.iv,
    };
  }
}

export class DataTrackExtensions extends Serializable {
  userTimestamp?: UserTimestampExtension;
  e2ee?: E2eeExtExtension;

  constructor(opts: { userTimestamp?: UserTimestampExtension, e2ee?: E2eeExtExtension } = {}) {
    super();
    this.userTimestamp = opts.userTimestamp;
    this.e2ee = opts.e2ee;
  }

  toBinaryLengthBytes() {
    let lengthBytes = 0;
    if (this.userTimestamp) {
      lengthBytes += this.userTimestamp.toBinaryLengthBytes();
    }
    if (this.e2ee) {
      lengthBytes += this.e2ee.toBinaryLengthBytes();
    }
    return lengthBytes;
  }

  toBinaryInto(dataView: DataView) {
    let byteIndex = 0;

    if (this.userTimestamp) {
      const userTimestampBytes = this.userTimestamp.toBinaryInto(dataView);
      byteIndex += userTimestampBytes;
    }

    if (this.e2ee) {
      const e2eeBytes = this.e2ee.toBinaryInto(dataView);
      byteIndex += e2eeBytes;
    }

    return byteIndex;
  }

  toJSON() {
    return {
      userTimestamp: this.userTimestamp?.toJSON() ?? null,
      e2ee: this.e2ee?.toJSON() ?? null,
    };
  }
}

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
      marker: this.marker,
      trackHandle: this.trackHandle.value,
      sequence: this.sequence.value,
      frameNumber: this.frameNumber.value,
      timestamp: this.timestamp.timestamp,
      extensions: this.extensions.toJSON(),
    };
  }
}

/// Marker indicating a packet's position in relation to a frame.
enum FrameMarker {
    /** Packet is the first in a frame. */
    Start = 0,
    /** Packet is within a frame. */
    Inter = 1,
    /** Packet is the last in a frame. */
    Final = 2,
    /** Packet is the only one in a frame. */
    Single = 3,
}

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
    return { header: this.header, payload: this.payload };
  }
}


// Example:
//
// const extensions = new DataTrackExtensions();
// const header = new DataTrackPacketHeader({
//   marker: FrameMarker.Single,
//   trackHandle: DataTrackHandleAllocator.get()!,
//   sequence: WrapAroundUnsignedInt.u16(3),
//   frameNumber: WrapAroundUnsignedInt.u16(5),
//   timestamp: DataTrackTimestamp.fromRtpTicks(100),
//   extensions,
// });
// const payload = new ArrayBuffer(10);
// const packet = new DataTrackPacket(header, payload);

// console.log('PACKET:', packet.toBinary());
