import { RequestResponse_Reason } from '@livekit/protocol';
import { LivekitReasonedError } from '../errors';

export enum DataTrackSchemaStorageErrorReason {
  /** Request to store or retrieve a schema definition timed-out */
  Timeout = 0,
  /** The participant has not defined a schema with this ID */
  NotFound = 1,
  /** The server rejected the request */
  RequestFailed = 2,
  /** The server response is malformed */
  MalformedResponse = 3,
  /** The retrieved schema definition is not valid UTF-8 */
  InvalidDefinition = 4,
  /** Request cancelled by caller */
  Cancelled = 5,
  /** Cannot store or retrieve a schema definition when disconnected */
  Disconnected = 6,
}

export class DataTrackSchemaStorageError<
  Reason extends DataTrackSchemaStorageErrorReason = DataTrackSchemaStorageErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackSchemaStorageError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(24, message, options);
    this.reason = reason;
    this.reasonName = DataTrackSchemaStorageErrorReason[reason];
  }

  static timeout() {
    return new DataTrackSchemaStorageError(
      'Schema storage request timed out',
      DataTrackSchemaStorageErrorReason.Timeout,
    );
  }

  static notFound(message: string) {
    return new DataTrackSchemaStorageError(
      message || 'The participant has not defined a schema with this ID',
      DataTrackSchemaStorageErrorReason.NotFound,
    );
  }

  static requestFailed(reason: RequestResponse_Reason, message: string) {
    return new DataTrackSchemaStorageError(
      `Schema storage request failed (${RequestResponse_Reason[reason]}): ${message}`,
      DataTrackSchemaStorageErrorReason.RequestFailed,
    );
  }

  static malformedResponse() {
    return new DataTrackSchemaStorageError(
      'Schema storage response is malformed',
      DataTrackSchemaStorageErrorReason.MalformedResponse,
    );
  }

  static invalidDefinition(options?: { cause?: unknown }) {
    return new DataTrackSchemaStorageError(
      'Schema definition is not valid UTF-8',
      DataTrackSchemaStorageErrorReason.InvalidDefinition,
      options,
    );
  }

  // NOTE: this was introduced by web / there isn't a corresponding case in the rust version.
  static cancelled() {
    return new DataTrackSchemaStorageError(
      'Schema storage request cancelled by caller',
      DataTrackSchemaStorageErrorReason.Cancelled,
    );
  }

  static disconnected() {
    return new DataTrackSchemaStorageError(
      'Cannot store or retrieve a schema definition when disconnected',
      DataTrackSchemaStorageErrorReason.Disconnected,
    );
  }
}
