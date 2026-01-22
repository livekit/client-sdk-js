import { LivekitReasonedError } from "../../errors";
import type { DataTrackHandleError } from "../handle";

export enum DataTrackDeserializeErrorReason {
  TooShort = 0,
  HeaderOverrun = 1,
  MissingExtWords = 2,
  UnsupportedVersion = 3,
  InvalidHandle = 4,
  MalformedExt = 5,
}

export class DataTrackDeserializeError<Reason extends DataTrackDeserializeErrorReason> extends LivekitReasonedError<DataTrackDeserializeErrorReason> {
  readonly name = 'DataTrackDeserializeError';

  reason: Reason;

  reasonName: string;

  cause?: Reason extends DataTrackDeserializeErrorReason.InvalidHandle ? DataTrackHandleError : never;

  constructor(message: string, reason: Reason, options?: ErrorOptions) {
    super(19, message, options);
    this.reason = reason;
    this.reasonName = DataTrackDeserializeErrorReason[reason];
  }

  static tooShort() {
    return new DataTrackDeserializeError("Too short to contain a valid header", DataTrackDeserializeErrorReason.TooShort);
  }

  static headerOverrun() {
    return new DataTrackDeserializeError("Header exceeds total packet length", DataTrackDeserializeErrorReason.HeaderOverrun);
  }

  static missingExtWords() {
    return new DataTrackDeserializeError("Extension word indicator is missing", DataTrackDeserializeErrorReason.MissingExtWords);
  }

  static unsupportedVersion(version: number) {
    return new DataTrackDeserializeError(`Unsupported version ${version}`, DataTrackDeserializeErrorReason.UnsupportedVersion);
  }

  static invalidHandle(cause: DataTrackHandleError) {
    return new DataTrackDeserializeError(
      `invalid track handle: ${cause.message}`,
      DataTrackDeserializeErrorReason.InvalidHandle,
      { cause },
    );
  }

  static malformedExt(tag: number) {
    return new DataTrackDeserializeError(`Extension with tag ${tag} is malformed`, DataTrackDeserializeErrorReason.MalformedExt);
  }
}
