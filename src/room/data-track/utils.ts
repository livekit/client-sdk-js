import TypedPromise from "../../utils/TypedPromise";
import { DataTrackError, DataTrackErrorReason } from "../errors";

export const U16_MAX_SIZE = 0xFFFF;

/**
  * A number of fields withing the data tracks packet specification assume wrap around behavior when
  * an unsigned type is incremented beyond its max size (ie, the packet `sequence` field). This
  * wrapper type manually reimplements this wrap around behavior given javascript's lack of fized
  * size integer types.
  */
export class WrapAroundUnsignedInt<MaxSize extends number> {
  value: number;
  private maxSize: MaxSize;

  static u16(raw: number) {
    return new WrapAroundUnsignedInt(raw, U16_MAX_SIZE);
  }

  constructor(raw: number, maxSize: MaxSize) {
    this.value = raw;
    if (maxSize > Number.MAX_SAFE_INTEGER) {
      throw new Error('WrapAroundUnsignedInt: cannot faithfully represent an integer bigger than MAX_SAFE_INTEGER.');
    }
    this.maxSize = maxSize;
  }

  /** Manually clamp the given containing value according to the wrap around max size bounds. Use
    * this after out of bounds modification to the contained value by external code. */
  clamp() {
    while (this.value >= this.maxSize) {
      this.value -= this.maxSize;
    }
  }

  /** When called, maps the containing value to a new containing value. After mapping, the wrap
    * around external max size bounds are applied. */
  update(updateFn: (value: number) => number) {
    this.value = updateFn(this.value);
    this.clamp();
  }
}

export class DataTrackHandle {
  public value: number;

  static fromNumber(raw: number): TypedPromise<DataTrackHandle, DataTrackError<DataTrackErrorReason.DataTrackHandleReserved | DataTrackErrorReason.DataTrackHandleTooLarge>>  {
    if (raw === 0) {
      return TypedPromise.reject(new DataTrackError("0x00 is a reserved value.", DataTrackErrorReason.DataTrackHandleTooLarge as 1 /* FIXME: get rid of the cast */));
    }
    if (raw > U16_MAX_SIZE) {
      return TypedPromise.reject(new DataTrackError("The specified value is too large to be a valid track handle", DataTrackErrorReason.DataTrackHandleReserved as 0 /* FIXME: get rid of the cast */));
    }
    return TypedPromise.resolve(new DataTrackHandle(raw));
  }

  constructor(raw: number) {
    this.value = raw;
  }
}

/** Manage allocating new handles which don't conflict over the lifetime of the client. */
export class DataTrackHandleAllocator {
  static value = 0;
  
  /** Returns a unique track handle for the next publication, if one can be obtained. */
  static get(): DataTrackHandle | null {
    this.value += 1;
    if (this.value > U16_MAX_SIZE) {
      return null;
    }
    return new DataTrackHandle(this.value);
  }
}

export class DataTrackTimestamp<RateInHz extends number> {
  rateInHz: RateInHz;
  timestamp: number;

  static fromRtpTicks(rtpTicks: number) {
    return new DataTrackTimestamp(rtpTicks, 90_000);
  }

  asTicks() {
    return this.timestamp;
  }

  private constructor(raw: number, rateInHz: RateInHz) {
    this.timestamp = raw;
    this.rateInHz = rateInHz;
  }
}
