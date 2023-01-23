import { LivekitError } from '../room/errors';

export const enum E2EEErrorReason {
  BrowserUnsupported,
  InvalidKey,
  MissingKey,
  InternalError,
  WorkerError,
}

export class E2EEError extends LivekitError {
  reason: E2EEErrorReason;

  constructor(message?: string, reason: E2EEErrorReason = E2EEErrorReason.InternalError) {
    super(40, message);
    this.reason = reason;
  }
}
