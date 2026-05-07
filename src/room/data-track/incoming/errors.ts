import { LivekitReasonedError } from '../../errors';

export enum DataTrackSubscribeErrorReason {
  /** The track has been unpublished and is no longer available */
  Unpublished = 0,
  /** Request to subscribe to data track timed-out */
  Timeout = 1,
  /** Cannot subscribe to data track when disconnected */
  Disconnected = 2,
  /** Subscription to data track cancelled by caller */
  Cancelled = 4,
}

export class DataTrackSubscribeError<
  Reason extends DataTrackSubscribeErrorReason = DataTrackSubscribeErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackSubscribeError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(22, message, options);
    this.reason = reason;
    this.reasonName = DataTrackSubscribeErrorReason[reason];
  }

  static unpublished() {
    return new DataTrackSubscribeError(
      'The track has been unpublished and is no longer available',
      DataTrackSubscribeErrorReason.Unpublished,
    );
  }

  static timeout() {
    return new DataTrackSubscribeError(
      'Request to subscribe to data track timed-out',
      DataTrackSubscribeErrorReason.Timeout,
    );
  }

  static disconnected() {
    return new DataTrackSubscribeError(
      'Cannot subscribe to data track when disconnected',
      DataTrackSubscribeErrorReason.Disconnected,
    );
  }

  // NOTE: this was introduced by web / there isn't a corresponding case in the rust version.
  static cancelled() {
    return new DataTrackSubscribeError(
      'Subscription to data track cancelled by caller',
      DataTrackSubscribeErrorReason.Cancelled,
    );
  }
}
