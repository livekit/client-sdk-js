import { LivekitError } from '../room/errors';

export const enum E2EEErrorReason {
  BrowserUnsupported,
  InvalidKey,
  InternalError,
  WorkerError,
}

export class E2EEError extends LivekitError {
  reason: E2EEErrorReason | undefined;

  constructor(message?: string, reason?: E2EEErrorReason) {
    super(40, message);
    this.reason = reason;
  }
}
