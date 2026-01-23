import { type Throws } from '../../utils/throws';
import { LivekitReasonedError } from '../errors';
import { U16_MAX_SIZE } from './utils';

export enum DataTrackHandleErrorReason {
  Reserved = 0,
  TooLarge = 1,
}

export class DataTrackHandleError<
  Reason extends DataTrackHandleErrorReason = DataTrackHandleErrorReason,
> extends LivekitReasonedError<DataTrackHandleErrorReason> {
  readonly name = 'DataTrackHandleError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason) {
    super(19, message);
    this.reason = reason;
    this.reasonName = DataTrackHandleErrorReason[reason];
  }

  isReason<R extends DataTrackHandleErrorReason>(reason: R): this is DataTrackHandleError<R> {
    return (this.reason as unknown as R) === reason;
  }

  static tooLarge() {
    return new DataTrackHandleError(
      'Value too large to be a valid track handle',
      DataTrackHandleErrorReason.TooLarge,
    );
  }

  static reserved(value: number) {
    return new DataTrackHandleError(
      `0x${value.toString(16)} is a reserved value.`,
      DataTrackHandleErrorReason.Reserved,
    );
  }
}

export class DataTrackHandle {
  public value: number;

  static fromNumber(
    raw: number,
  ): Throws<
    DataTrackHandle,
    | DataTrackHandleError<DataTrackHandleErrorReason.TooLarge>
    | DataTrackHandleError<DataTrackHandleErrorReason.Reserved>
  > {
    if (raw === 0) {
      throw DataTrackHandleError.reserved(raw);
    }
    if (raw > U16_MAX_SIZE) {
      throw DataTrackHandleError.tooLarge();
    }
    return new DataTrackHandle(raw);
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
