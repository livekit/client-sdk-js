import Serializable from "./serializable";

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

export class DataTrackUserTimestampExtension extends DataTrackExtension {
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

  constructor(opts: { userTimestamp?: DataTrackUserTimestampExtension, e2ee?: DataTrackE2eeExtension } = {}) {
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
