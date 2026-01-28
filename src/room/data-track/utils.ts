export const U16_MAX_SIZE = 0xffff;
export const U32_MAX_SIZE = 0xffffffff;

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

  static u32(raw: number) {
    return new WrapAroundUnsignedInt(raw, U32_MAX_SIZE);
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

  clone() {
    return new WrapAroundUnsignedInt(this.value, this.maxSize);
  }

  /** When called, maps the containing value to a new containing value. After mapping, the wrap
   * around external max size bounds are applied. Note that this is a mutative operation. */
  update(updateFn: (value: number) => number) {
    this.value = updateFn(this.value);
    this.clamp();
  }

  /** Increments the given `n` to the inner value. Note that this is a mutative operation. */
  increment(n = 1) {
    this.update((value) => value + n);
  }

  /** Decrements the given `n` from the inner value. Note that this is a mutative operation. */
  decrement(n = 1) {
    this.update((value) => value - n);
  }

  getThenIncrement() {
    const previousValue = this.value;
    this.increment();
    return new WrapAroundUnsignedInt(previousValue, this.maxSize);
  }
}

export class DataTrackTimestamp<RateInHz extends number> {
  rateInHz: RateInHz;

  timestamp: WrapAroundUnsignedInt<typeof U32_MAX_SIZE>;

  static fromRtpTicks(rtpTicks: number) {
    return new DataTrackTimestamp(rtpTicks, 90_000);
  }

  static rtpRandom() {
    // FIXME: does this need to be a higher quality PRNG?
    const randomValue = Math.round(Math.random() * U32_MAX_SIZE);
    return DataTrackTimestamp.fromRtpTicks(randomValue);
  }

  private constructor(raw: number, rateInHz: RateInHz) {
    this.timestamp = WrapAroundUnsignedInt.u32(raw);
    this.rateInHz = rateInHz;
  }

  asTicks() {
    return this.timestamp.value;
  }

  clone() {
    return new DataTrackTimestamp(this.timestamp.value, this.rateInHz);
  }

  wrappingAdd(n: number) {
    this.timestamp.increment(n);
  }

  /** Returns true if {@link this} is before the passed other {@link DataTrackTimestamp}.
   * Note that if the timestamp wraps around past its bounds, this function may not produce the
   * correct result. */
  isBefore(other: DataTrackTimestamp<RateInHz>) {
    return this.timestamp.value < other.timestamp.value;
  }
}

export class DataTrackClock<RateInHz extends number> {
  epoch: Date;

  base: DataTrackTimestamp<RateInHz>;

  previous: DataTrackTimestamp<RateInHz>;

  rateInHz: RateInHz;

  private constructor(rateInHz: RateInHz, epoch: Date, base: DataTrackTimestamp<RateInHz>) {
    this.epoch = epoch;
    this.base = base;
    this.previous = base;
    this.rateInHz = rateInHz;
  }

  static startingNow<RateInHz extends number>(
    base: DataTrackTimestamp<RateInHz>,
    rateInHz: RateInHz,
  ) {
    return new DataTrackClock(rateInHz, new Date(), base);
  }

  static startingAtTime<RateInHz extends number>(
    epoch: Date,
    base: DataTrackTimestamp<RateInHz>,
    rateInHz: RateInHz,
  ) {
    return new DataTrackClock(rateInHz, epoch, base);
  }

  static rtpStartingNow(base: DataTrackTimestamp<90_000>) {
    return DataTrackClock.startingNow(base, 90_000);
  }

  static rtpStartingAtTime(epoch: Date, base: DataTrackTimestamp<90_000>) {
    return DataTrackClock.startingAtTime(epoch, base, 90_000);
  }

  now(): DataTrackTimestamp<RateInHz> {
    return this.at(new Date());
  }

  at(timestamp: Date) {
    let elapsedMs = timestamp.getTime() - this.epoch.getTime();
    let durationTicks = DataTrackClock.durationInMsToTicks(elapsedMs, this.rateInHz);

    let result = this.base.clone();
    result.wrappingAdd(durationTicks);

    // Enforce monotonicity in RTP wraparound space
    if (result.isBefore(this.previous)) {
      result = this.previous;
    }
    this.previous = result;
    return result;
  }

  /** Convert a duration since the epoch into clock ticks. */
  static durationInMsToTicks(durationMilliseconds: number, rateInHz: number) {
    // round(nanos * rate_hz / 1e9)
    let durationNanoseconds = durationMilliseconds * 1e6;
    let ticks = (durationNanoseconds * rateInHz + 500_000_000) / 1_000_000_000;
    return Math.round(ticks);
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
