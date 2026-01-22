import type { Throws } from 'throws-transformer/src/throws';
import { EXT_TAG_PADDING } from './constants';
import { DataTrackDeserializeError, DataTrackDeserializeErrorReason } from './errors';
import Serializable from './serializable';

enum DataTrackExtensionTag {
  UserTimestamp = 2,
  E2ee = 1,
}

abstract class DataTrackExtension extends Serializable {
  static tag: DataTrackExtensionTag;

  static lengthBytes: number;
}

export class DataTrackUserTimestampExtension extends DataTrackExtension {
  tag = DataTrackExtensionTag.UserTimestamp;

  lengthBytes = 8;

  private timestamp: bigint;

  constructor(timestamp: bigint) {
    super();
    this.timestamp = timestamp;
  }

  toBinaryLengthBytes(): number {
    return 2 /* tag (u16) */ + 2 /* length (u16) */ + this.lengthBytes;
  }

  toBinaryInto(dataView: DataView) {
    let byteIndex = 0;

    dataView.setUint16(byteIndex, this.tag);
    byteIndex += 2;

    dataView.setUint16(byteIndex, this.lengthBytes - 1);
    byteIndex += 2;

    dataView.setBigUint64(byteIndex, this.timestamp);
    byteIndex += 8;

    const totalLengthBytes = this.toBinaryLengthBytes();
    if (byteIndex !== totalLengthBytes) {
      throw new Error(
        `DataTrackUserTimestampExtension.toBinaryInto: Wrote ${byteIndex} bytes but expected length was ${totalLengthBytes} bytes`,
      );
    }

    return byteIndex;
  }

  toJSON() {
    return {
      tag: this.tag as number,
      lengthBytes: this.lengthBytes,

      timestamp: this.timestamp,
    };
  }
}

export class DataTrackE2eeExtension extends DataTrackExtension {
  tag = DataTrackExtensionTag.E2ee;

  lengthBytes = 13;

  private keyIndex: number;

  private iv: Uint8Array; /* NOTE: According to the rust implementation, this should be 12 bytes long. */

  constructor(keyIndex: number, iv: Uint8Array) {
    super();
    this.keyIndex = keyIndex;
    this.iv = iv;
  }

  toBinaryLengthBytes(): number {
    return 2 /* tag (u16) */ + 2 /* length (u16) */ + this.lengthBytes;
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

    const totalLengthBytes = this.toBinaryLengthBytes();
    if (byteIndex !== totalLengthBytes) {
      throw new Error(
        `DataTrackE2eeExtension.toBinaryInto: Wrote ${byteIndex} bytes but expected length was ${totalLengthBytes} bytes`,
      );
    }

    return byteIndex;
  }

  toJSON() {
    return {
      tag: this.tag as number,
      lengthBytes: this.lengthBytes,

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

  toBinaryInto(dataView: DataView) {
    let byteIndex = 0;

    if (this.e2ee) {
      const userTimestampBytes = this.e2ee.toBinaryInto(dataView);
      byteIndex += userTimestampBytes;
    }

    if (this.userTimestamp) {
      const e2eeBytes = this.userTimestamp.toBinaryInto(
        new DataView(dataView.buffer, dataView.byteOffset + byteIndex),
      );
      byteIndex += e2eeBytes;
    }

    const totalLengthBytes = this.toBinaryLengthBytes();
    if (byteIndex !== totalLengthBytes) {
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
    const dataView =
      input instanceof DataView
        ? input
        : new DataView(input instanceof ArrayBuffer ? input : input.buffer);

    let userTimestamp: DataTrackUserTimestampExtension | undefined;
    let e2ee: DataTrackE2eeExtension | undefined;

    let byteIndex = 0;
    while (dataView.byteLength - byteIndex >= 4) {
      const tag = dataView.getUint16(byteIndex);
      byteIndex += 2;

      const lengthBytes = dataView.getUint16(byteIndex);
      byteIndex += 2;

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
          byteIndex += lengthBytes + 1;
          break;

        case DataTrackExtensionTag.E2ee:
          if (dataView.byteLength - byteIndex < DataTrackE2eeExtension.lengthBytes) {
            throw DataTrackDeserializeError.malformedExt(tag);
          }

          const keyIndex = dataView.getUint8(byteIndex);

          const iv = new Uint8Array(12);
          for (let i = 0; i < iv.length; i += 1) {
            iv[i] = dataView.getUint8(byteIndex + 1 /* key index */ + i);
          }

          e2ee = new DataTrackE2eeExtension(keyIndex, iv);
          byteIndex += lengthBytes + 1;
          break;

        default:
          // Skip over unknown extensions (forward compatible).
          if (dataView.byteLength - byteIndex < lengthBytes) {
            throw DataTrackDeserializeError.malformedExt(tag);
          }
          byteIndex += lengthBytes + 1;
          break;
      }
    }

    return [new DataTrackExtensions({ userTimestamp, e2ee }), dataView.byteLength];
  }

  toJSON() {
    return {
      userTimestamp: this.userTimestamp?.toJSON() ?? null,
      e2ee: this.e2ee?.toJSON() ?? null,
    };
  }
}
