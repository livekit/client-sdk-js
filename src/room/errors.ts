import { DisconnectReason, RequestResponse_Reason } from '@livekit/protocol';

export class LivekitError extends Error {
  code: number;

  constructor(code: number, message?: string) {
    super(message || 'an error has occured');
    this.name = 'LiveKitError';
    this.code = code;
  }
}

export enum ConnectionErrorReason {
  NotAllowed,
  ServerUnreachable,
  InternalError,
  Cancelled,
  LeaveRequest,
  Timeout,
}

export class ConnectionError extends LivekitError {
  status?: number;

  context?: unknown | DisconnectReason;

  reason: ConnectionErrorReason;

  reasonName: string;

  constructor(
    message: string,
    reason: ConnectionErrorReason,
    status?: number,
    context?: unknown | DisconnectReason,
  ) {
    super(1, message);
    this.name = 'ConnectionError';
    this.status = status;
    this.reason = reason;
    this.context = context;
    this.reasonName = ConnectionErrorReason[reason];
  }
}

export class DeviceUnsupportedError extends LivekitError {
  constructor(message?: string) {
    super(21, message ?? 'device is unsupported');
    this.name = 'DeviceUnsupportedError';
  }
}

export class TrackInvalidError extends LivekitError {
  constructor(message?: string) {
    super(20, message ?? 'track is invalid');
    this.name = 'TrackInvalidError';
  }
}

export class UnsupportedServer extends LivekitError {
  constructor(message?: string) {
    super(10, message ?? 'unsupported server');
    this.name = 'UnsupportedServer';
  }
}

export class UnexpectedConnectionState extends LivekitError {
  constructor(message?: string) {
    super(12, message ?? 'unexpected connection state');
    this.name = 'UnexpectedConnectionState';
  }
}

export class NegotiationError extends LivekitError {
  constructor(message?: string) {
    super(13, message ?? 'unable to negotiate');
    this.name = 'NegotiationError';
  }
}

export class PublishDataError extends LivekitError {
  constructor(message?: string) {
    super(14, message ?? 'unable to publish data');
    this.name = 'PublishDataError';
  }
}

export class PublishTrackError extends LivekitError {
  status: number;

  constructor(message: string, status: number) {
    super(15, message);
    this.name = 'PublishTrackError';
    this.status = status;
  }
}

export type RequestErrorReason =
  | Exclude<RequestResponse_Reason, RequestResponse_Reason.OK>
  | 'TimeoutError';

export class SignalRequestError extends LivekitError {
  reason: RequestErrorReason;

  reasonName: string;

  constructor(message: string, reason: RequestErrorReason) {
    super(15, message);
    this.reason = reason;
    this.reasonName = typeof reason === 'string' ? reason : RequestResponse_Reason[reason];
  }
}

export enum DataStreamErrorReason {
  // Unable to open a stream with the same ID more than once.
  AlreadyOpened,

  // Stream closed abnormally by remote participant.
  AbnormalEnd,

  // Incoming chunk data could not be decoded.
  DecodeFailed,

  // Read length exceeded total length specified in stream header.
  LengthExceeded,

  // Read length less than total length specified in stream header.
  LengthIncomplete,

  // Stream terminated before completion.
  Terminated,

  // Cannot perform operations on an unknown stream.
  UnknownStream,

  // Unable to register a stream handler more than once.
  HandlerAlreadyRegistered,

  // // Given destination URL is not a directory.
  // NotDirectory,

  // // Unable to read information about the file to send.
  // FileInfoUnavailable,
}

export class DataStreamError extends LivekitError {
  reason: DataStreamErrorReason;

  reasonName: string;

  constructor(message: string, reason: DataStreamErrorReason) {
    super(16, message);
    this.name = 'DataStreamError';
    this.reason = reason;
    this.reasonName = DataStreamErrorReason[reason];
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
