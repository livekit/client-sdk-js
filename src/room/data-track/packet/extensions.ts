import { type Throws } from '../../../utils/throws';
import { coerceToDataView } from '../utils';
import { EXT_TAG_PADDING, U8_LENGTH_BYTES, U16_LENGTH_BYTES, U64_LENGTH_BYTES } from './constants';
import { DataTrackDeserializeError, DataTrackDeserializeErrorReason } from './errors';
import Serializable from './serializable';

export enum DataTrackExtensionTag {
  UserTimestamp = 2,
  E2ee = 1,
}

abstract class DataTrackExtension extends Serializable {
  static tag: DataTrackExtensionTag;

  static lengthBytes: number;
}

export class DataTrackUserTimestampExtension extends DataTrackExtension {
  static tag = DataTrackExtensionTag.UserTimestamp;

  static lengthBytes = 8;

  private timestamp: bigint;

  constructor(timestamp: bigint) {
    super();
    this.timestamp = timestamp;
  }

  toBinaryLengthBytes(): number {
    return (
      U16_LENGTH_BYTES /* tag */ +
      U16_LENGTH_BYTES /* length */ +
      DataTrackUserTimestampExtension.lengthBytes
    );
  }

  toBinaryInto(dataView: DataView): Throws<number, never> {
    let byteIndex = 0;

    dataView.setUint16(byteIndex, DataTrackUserTimestampExtension.tag);
    byteIndex += U16_LENGTH_BYTES;

    const rtpOrientedLength = DataTrackUserTimestampExtension.lengthBytes - 1;
    dataView.setUint16(byteIndex, rtpOrientedLength);
    byteIndex += U16_LENGTH_BYTES;

    dataView.setBigUint64(byteIndex, this.timestamp);
    byteIndex += U64_LENGTH_BYTES;

    const totalLengthBytes = this.toBinaryLengthBytes();
    if (byteIndex !== totalLengthBytes) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        `DataTrackUserTimestampExtension.toBinaryInto: Wrote ${byteIndex} bytes but expected length was ${totalLengthBytes} bytes`,
      );
    }

    return byteIndex;
  }

  toJSON() {
    return {
      tag: DataTrackUserTimestampExtension.tag as number,
      lengthBytes: DataTrackUserTimestampExtension.lengthBytes,

      timestamp: this.timestamp,
    };
  }
}

export class DataTrackE2eeExtension extends DataTrackExtension {
  static tag = DataTrackExtensionTag.E2ee;

  static lengthBytes = 13;

  private keyIndex: number;

  private iv: Uint8Array; /* NOTE: According to the rust implementation, this should be 12 bytes long. */

  constructor(keyIndex: number, iv: Uint8Array) {
    super();
    this.keyIndex = keyIndex;
    this.iv = iv;
  }

  toBinaryLengthBytes(): number {
    return (
      U16_LENGTH_BYTES /* tag */ +
      U16_LENGTH_BYTES /* length */ +
      DataTrackE2eeExtension.lengthBytes
    );
  }

  toBinaryInto(dataView: DataView): Throws<number, never> {
    let byteIndex = 0;

    dataView.setUint16(byteIndex, DataTrackE2eeExtension.tag);
    byteIndex += U16_LENGTH_BYTES;

    const rtpOrientedLength = DataTrackE2eeExtension.lengthBytes - 1;
    dataView.setUint16(byteIndex, rtpOrientedLength);
    byteIndex += U16_LENGTH_BYTES;

    dataView.setUint8(byteIndex, this.keyIndex);
    byteIndex += U8_LENGTH_BYTES;

    for (let i = 0; i < this.iv.length; i += 1) {
      dataView.setUint8(byteIndex, this.iv[i]);
      byteIndex += U8_LENGTH_BYTES;
    }

    const totalLengthBytes = this.toBinaryLengthBytes();
    if (byteIndex !== totalLengthBytes) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        `DataTrackE2eeExtension.toBinaryInto: Wrote ${byteIndex} bytes but expected length was ${totalLengthBytes} bytes`,
      );
    }

    return byteIndex;
  }

  toJSON() {
    return {
      tag: DataTrackE2eeExtension.tag as number,
      lengthBytes: DataTrackE2eeExtension.lengthBytes,

      keyIndex: this.keyIndex,
      iv: this.iv,
    };
  }
}

export class DataTrackExtensions extends Serializable {
  userTimestamp?: DataTrackUserTimestampExtension;

  e2ee?: DataTrackE2eeExtension;

  constructor(
    opts: { userTimestamp?: DataTrackUserTimestampExtension; e2ee?: DataTrackE2eeExtension } = {},
  ) {
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

  toBinaryInto(dataView: DataView): Throws<number, never> {
    let byteIndex = 0;

    if (this.e2ee) {
      const e2eeBytes = this.e2ee.toBinaryInto(dataView);
      byteIndex += e2eeBytes;
    }

    if (this.userTimestamp) {
      const userTimestampBytes = this.userTimestamp.toBinaryInto(
        new DataView(dataView.buffer, dataView.byteOffset + byteIndex),
      );
      byteIndex += userTimestampBytes;
    }

    const totalLengthBytes = this.toBinaryLengthBytes();
    if (byteIndex !== totalLengthBytes) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        `DataTrackExtensions.toBinaryInto: Wrote ${byteIndex} bytes but expected length was ${totalLengthBytes} bytes`,
      );
    }

    return byteIndex;
  }

  static fromBinary<Input extends DataView | ArrayBuffer | Uint8Array>(
    input: Input,
  ): Throws<
    [extensions: DataTrackExtensions, byteLength: number],
    DataTrackDeserializeError<DataTrackDeserializeErrorReason.MalformedExt>
  > {
    const dataView = coerceToDataView(input);

    let userTimestamp: DataTrackUserTimestampExtension | undefined;
    let e2ee: DataTrackE2eeExtension | undefined;

    let byteIndex = 0;
    while (dataView.byteLength - byteIndex >= U16_LENGTH_BYTES + U16_LENGTH_BYTES) {
      const tag = dataView.getUint16(byteIndex);
      byteIndex += U16_LENGTH_BYTES;

      const rtpOrientedLength = dataView.getUint16(byteIndex);
      const lengthBytes = rtpOrientedLength + 1;
      byteIndex += U16_LENGTH_BYTES;

      if (tag === EXT_TAG_PADDING) {
        // Skip padding
        continue;
      }

      switch (tag) {
        case DataTrackExtensionTag.UserTimestamp:
          if (dataView.byteLength - byteIndex < DataTrackUserTimestampExtension.lengthBytes) {
            throw DataTrackDeserializeError.malformedExt(tag);
          }
          userTimestamp = new DataTrackUserTimestampExtension(dataView.getBigUint64(byteIndex));
          byteIndex += lengthBytes;
          break;

        case DataTrackExtensionTag.E2ee:
          if (dataView.byteLength - byteIndex < DataTrackE2eeExtension.lengthBytes) {
            throw DataTrackDeserializeError.malformedExt(tag);
          }

          const keyIndex = dataView.getUint8(byteIndex);

          const iv = new Uint8Array(12);
          for (let i = 0; i < iv.length; i += 1) {
            let byteIndexForIv = byteIndex;
            byteIndexForIv += U8_LENGTH_BYTES; // key index
            byteIndexForIv += i * U8_LENGTH_BYTES; // Index into iv array
            iv[i] = dataView.getUint8(byteIndexForIv);
          }

          e2ee = new DataTrackE2eeExtension(keyIndex, iv);
          byteIndex += lengthBytes;
          break;

        default:
          // Skip over unknown extensions (forward compatible).
          if (dataView.byteLength - byteIndex < lengthBytes) {
            throw DataTrackDeserializeError.malformedExt(tag);
          }
          byteIndex += lengthBytes;
          break;
      }
    }

    // NOTE: padding bytes after extension data is intentionally not being processed

    return [new DataTrackExtensions({ userTimestamp, e2ee }), dataView.byteLength];
  }

  toJSON() {
    return {
      userTimestamp: this.userTimestamp?.toJSON() ?? null,
      e2ee: this.e2ee?.toJSON() ?? null,
    };
  }
}
