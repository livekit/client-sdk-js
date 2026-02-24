import { LivekitReasonedError } from '../../errors';
import { DataTrackPacketizerError } from '../packetizer';

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

  /** The name requested is not able to be used when creating the data track. */
  InvalidName = 6,
}

export class DataTrackPublishError<
  Reason extends DataTrackPublishErrorReason = DataTrackPublishErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackPublishError';

  reason: Reason;

  reasonName: string;

  /** Underling message from the SFU, if one was provided */
  rawMessage?: string;

  constructor(message: string, reason: Reason, options?: { rawMessage?: string; cause?: unknown }) {
    super(21, message, options);
    this.reason = reason;
    this.reasonName = DataTrackPublishErrorReason[reason];
    this.rawMessage = options?.rawMessage;
  }

  static notAllowed(rawMessage?: string) {
    return new DataTrackPublishError(
      'Data track publishing unauthorized',
      DataTrackPublishErrorReason.NotAllowed,
      { rawMessage },
    );
  }

  static duplicateName(rawMessage?: string) {
    return new DataTrackPublishError(
      'Track name already taken',
      DataTrackPublishErrorReason.DuplicateName,
      { rawMessage },
    );
  }

  static invalidName(rawMessage?: string) {
    return new DataTrackPublishError(
      'Track name is invalid',
      DataTrackPublishErrorReason.InvalidName,
      { rawMessage },
    );
  }

  static timeout() {
    return new DataTrackPublishError(
      'Publish data track timed-out',
      DataTrackPublishErrorReason.Timeout,
    );
  }

  static limitReached(rawMessage?: string) {
    return new DataTrackPublishError(
      'Data track publication limit reached',
      DataTrackPublishErrorReason.LimitReached,
      { rawMessage },
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

  static packetizer(cause: DataTrackPacketizerError) {
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
