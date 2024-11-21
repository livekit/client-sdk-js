import { DisconnectReason, RequestResponse_Reason } from '@livekit/protocol';

export class LivekitError extends Error {
  code: number;

  constructor(code: number, message?: string) {
    super(message || 'an error has occured');
    this.code = code;
  }
}

export const enum ConnectionErrorReason {
  NotAllowed,
  ServerUnreachable,
  InternalError,
  Cancelled,
  LeaveRequest,
}

export class ConnectionError extends LivekitError {
  status?: number;

  context?: unknown | DisconnectReason;

  reason: ConnectionErrorReason;

  constructor(
    message: string,
    reason: ConnectionErrorReason,
    status?: number,
    context?: unknown | DisconnectReason,
  ) {
    super(1, message);
    this.status = status;
    this.reason = reason;
    this.context = context;
  }
}

export class DeviceUnsupportedError extends LivekitError {
  constructor(message?: string) {
    super(21, message ?? 'device is unsupported');
  }
}

export class TrackInvalidError extends LivekitError {
  constructor(message?: string) {
    super(20, message ?? 'track is invalid');
  }
}

export class UnsupportedServer extends LivekitError {
  constructor(message?: string) {
    super(10, message ?? 'unsupported server');
  }
}

export class UnexpectedConnectionState extends LivekitError {
  constructor(message?: string) {
    super(12, message ?? 'unexpected connection state');
  }
}

export class NegotiationError extends LivekitError {
  constructor(message?: string) {
    super(13, message ?? 'unable to negotiate');
  }
}

export class PublishDataError extends LivekitError {
  constructor(message?: string) {
    super(13, message ?? 'unable to publish data');
  }
}

export type RequestErrorReason =
  | Exclude<RequestResponse_Reason, RequestResponse_Reason.OK>
  | 'TimeoutError';

export class SignalRequestError extends LivekitError {
  reason: RequestErrorReason;

  constructor(message: string, reason: RequestErrorReason) {
    super(15, message);
    this.reason = reason;
  }
}

export enum MediaDeviceFailure {
  // user rejected permissions
  PermissionDenied = 'PermissionDenied',
  // device is not available
  NotFound = 'NotFound',
  // device is in use. On Windows, only a single tab may get access to a device at a time.
  DeviceInUse = 'DeviceInUse',
  Other = 'Other',
}

export namespace MediaDeviceFailure {
  export function getFailure(error: any): MediaDeviceFailure | undefined {
    if (error && 'name' in error) {
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return MediaDeviceFailure.NotFound;
      }
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return MediaDeviceFailure.PermissionDenied;
      }
      if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        return MediaDeviceFailure.DeviceInUse;
      }
      return MediaDeviceFailure.Other;
    }
  }
}
