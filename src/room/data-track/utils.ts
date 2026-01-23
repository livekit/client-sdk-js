export const U16_MAX_SIZE = 0xffff;

/**
 * A number of fields withing the data tracks packet specification assume wrap around behavior when
 * an unsigned type is incremented beyond its max size (ie, the packet `sequence` field). This
 * wrapper type manually reimplements this wrap around behavior given javascript's lack of fixed
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
    if (raw < 0) {
      throw new Error(
        'WrapAroundUnsignedInt: cannot faithfully represent an integer smaller than 0',
      );
    }
    if (maxSize > Number.MAX_SAFE_INTEGER) {
      throw new Error(
        'WrapAroundUnsignedInt: cannot faithfully represent an integer bigger than MAX_SAFE_INTEGER.',
      );
    }
    this.maxSize = maxSize;
    this.clamp();
  }

  /** Manually clamp the given containing value according to the wrap around max size bounds. Use
   * this after out of bounds modification to the contained value by external code. */
  clamp() {
    while (this.value > this.maxSize) {
      this.value -= this.maxSize + 1;
    }
    while (this.value < 0) {
      this.value += this.maxSize + 1;
    }
  }

  /** When called, maps the containing value to a new containing value. After mapping, the wrap
   * around external max size bounds are applied. */
  update(updateFn: (value: number) => number) {
    this.value = updateFn(this.value);
    this.clamp();
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

export function coerceToDataView<Input extends DataView | ArrayBuffer | Uint8Array>(
  input: Input,
): DataView {
  if (input instanceof DataView) {
    return input;
  } else if (input instanceof ArrayBuffer) {
    return new DataView(input);
  } else if (input instanceof Uint8Array) {
    return new DataView(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new Error(
      `Error coercing ${input} to DataView - input was not DataView, ArrayBuffer, or Uint8Array.`,
    );
  }
}
