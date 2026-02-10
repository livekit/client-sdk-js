import { LivekitReasonedError } from '../../errors';
import { DataTrackPacketizerError, DataTrackPacketizerReason } from '../packetizer';

export enum DataTrackPublishErrorReason {
  /**
   * Local participant does not have permission to publish data tracks.
   *
   * Ensure the participant's token contains the `canPublishData` grant.
   */
  NotAllowed = 0,

  /** A track with the same name is already published by the local participant. */
  DuplicateName = 1,

  /** Request to publish the track took long to complete. */
  Timeout = 2,

  /** No additional data tracks can be published by the local participant. */
  LimitReached = 3,

  /** Cannot publish data track when the room is disconnected. */
  Disconnected = 4,

  // NOTE: this was introduced by web / there isn't a corresponding case in the rust version.
  Cancelled = 5,
}

export class DataTrackPublishError<
  Reason extends DataTrackPublishErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackPublishError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(21, message, options);
    this.reason = reason;
    this.reasonName = DataTrackPublishErrorReason[reason];
  }

  static notAllowed() {
    return new DataTrackPublishError(
      'Data track publishing unauthorized',
      DataTrackPublishErrorReason.NotAllowed,
    );
  }

  static duplicateName() {
    return new DataTrackPublishError(
      'Track name already taken',
      DataTrackPublishErrorReason.DuplicateName,
    );
  }

  static timeout() {
    return new DataTrackPublishError(
      'Publish data track timed-out',
      DataTrackPublishErrorReason.Timeout,
    );
  }

  static limitReached() {
    return new DataTrackPublishError(
      'Data track publication limit reached',
      DataTrackPublishErrorReason.LimitReached,
    );
  }

  static disconnected() {
    return new DataTrackPublishError('Room disconnected', DataTrackPublishErrorReason.Disconnected);
  }

  // NOTE: this was introduced by web / there isn't a corresponding case in the rust version.
  static cancelled() {
    return new DataTrackPublishError(
      'Publish data track cancelled by caller',
      DataTrackPublishErrorReason.Cancelled,
    );
  }
}

export enum DataTrackPushFrameErrorReason {
  /** Track is no longer published. */
  TrackUnpublished = 0,
  /** Frame was dropped. */
  // NOTE: this should become a web specific error, the rust version of this "dropped" error means
  // something different and will be renamed to "QueueFull".
  Dropped = 1,
}

export class DataTrackPushFrameError<
  Reason extends DataTrackPushFrameErrorReason = DataTrackPushFrameErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackPushFrameError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(22, message, options);
    this.reason = reason;
    this.reasonName = DataTrackPushFrameErrorReason[reason];
  }

  static trackUnpublished() {
    return new DataTrackPushFrameError(
      'Track is no longer published',
      DataTrackPushFrameErrorReason.TrackUnpublished,
    );
  }

  static dropped(cause: unknown) {
    return new DataTrackPushFrameError('Frame was dropped', DataTrackPushFrameErrorReason.Dropped, {
      cause,
    });
  }
}

export enum DataTrackOutgoingPipelineErrorReason {
  Packetizer = 0,
  Encryption = 1,
}

export class DataTrackOutgoingPipelineError<
  Reason extends DataTrackOutgoingPipelineErrorReason = DataTrackOutgoingPipelineErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackOutgoingPipelineError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(21, message, options);
    this.reason = reason;
    this.reasonName = DataTrackOutgoingPipelineErrorReason[reason];
  }

  static packetizer(cause: DataTrackPacketizerError<DataTrackPacketizerReason.MtuTooShort>) {
    return new DataTrackOutgoingPipelineError(
      'Error packetizing frame',
      DataTrackOutgoingPipelineErrorReason.Packetizer,
      { cause },
    );
  }

  static encryption(cause: unknown) {
    return new DataTrackOutgoingPipelineError(
      'Error encrypting frame',
      DataTrackOutgoingPipelineErrorReason.Encryption,
      { cause },
    );
  }
}
