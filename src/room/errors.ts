import { DisconnectReason, RequestResponse_Reason } from '@livekit/protocol';

export class LivekitError extends Error {
  code: number;

  constructor(code: number, message?: string) {
    super(message || 'an error has occured');
    this.name = 'LiveKitError';
    this.code = code;
  }
}

export class SimulatedError extends LivekitError {
  readonly name = 'simulated';

  constructor(message = 'Simulated failure') {
    super(-1, message);
  }
}

export enum ConnectionErrorReason {
  NotAllowed,
  ServerUnreachable,
  InternalError,
  Cancelled,
  LeaveRequest,
  Timeout,
  WebSocket,
}

type NotAllowed = {
  reason: ConnectionErrorReason.NotAllowed;
  status: number;
  context?: unknown;
};

type InternalError = {
  reason: ConnectionErrorReason.InternalError;
  status: never;
  context?: { status?: number; statusText?: string };
};

type ConnectionTimeout = {
  reason: ConnectionErrorReason.Timeout;
  status: never;
  context: never;
};

type LeaveRequest = {
  reason: ConnectionErrorReason.LeaveRequest;
  status: never;
  context: DisconnectReason;
};

type Cancelled = {
  reason: ConnectionErrorReason.Cancelled;
  status: never;
  context: never;
};

type ServerUnreachable = {
  reason: ConnectionErrorReason.ServerUnreachable;
  status?: number;
  context?: never;
};

type WebSocket = {
  reason: ConnectionErrorReason.WebSocket;
  status?: number;
  context?: string;
};

type ConnectionErrorVariants =
  | NotAllowed
  | ConnectionTimeout
  | LeaveRequest
  | InternalError
  | Cancelled
  | ServerUnreachable
  | WebSocket;

export class ConnectionError<
  Variant extends ConnectionErrorVariants = ConnectionErrorVariants,
> extends LivekitError {
  status?: Variant['status'];

  context: Variant['context'];

  reason: Variant['reason'];

  reasonName: string;

  readonly name = 'ConnectionError';

  protected constructor(
    message: string,
    reason: Variant['reason'],
    status?: Variant['status'],
    context?: Variant['context'],
  ) {
    super(1, message);
    this.status = status;
    this.reason = reason;
    this.context = context;
    this.reasonName = ConnectionErrorReason[reason];
  }

  static notAllowed(message: string, status: number, context?: unknown) {
    return new ConnectionError<NotAllowed>(
      message,
      ConnectionErrorReason.NotAllowed,
      status,
      context,
    );
  }

  static timeout(message: string) {
    return new ConnectionError<ConnectionTimeout>(message, ConnectionErrorReason.Timeout);
  }

  static leaveRequest(message: string, context: DisconnectReason) {
    return new ConnectionError<LeaveRequest>(
      message,
      ConnectionErrorReason.LeaveRequest,
      undefined,
      context,
    );
  }

  static internal(message: string, context?: { status?: number; statusText?: string }) {
    return new ConnectionError<InternalError>(
      message,
      ConnectionErrorReason.InternalError,
      undefined,
      context,
    );
  }

  static cancelled(message: string) {
    return new ConnectionError<Cancelled>(message, ConnectionErrorReason.Cancelled);
  }

  static serverUnreachable(message: string, status?: number) {
    return new ConnectionError<ServerUnreachable>(
      message,
      ConnectionErrorReason.ServerUnreachable,
      status,
    );
  }

  static websocket(message: string, status?: number, reason?: string) {
    return new ConnectionError<WebSocket>(message, ConnectionErrorReason.WebSocket, status, reason);
  }
}

export class DeviceUnsupportedError extends LivekitError {
  readonly name = 'DeviceUnsupportedError';

  constructor(message?: string) {
    super(21, message ?? 'device is unsupported');
  }
}

export class TrackInvalidError extends LivekitError {
  readonly name = 'TrackInvalidError';

  constructor(message?: string) {
    super(20, message ?? 'track is invalid');
  }
}

export class UnsupportedServer extends LivekitError {
  readonly name = 'UnsupportedServer';

  constructor(message?: string) {
    super(10, message ?? 'unsupported server');
  }
}

export class UnexpectedConnectionState extends LivekitError {
  readonly name = 'UnexpectedConnectionState';

  constructor(message?: string) {
    super(12, message ?? 'unexpected connection state');
  }
}

export class NegotiationError extends LivekitError {
  readonly name = 'NegotiationError';

  constructor(message?: string) {
    super(13, message ?? 'unable to negotiate');
  }
}

export class PublishDataError extends LivekitError {
  readonly name = 'PublishDataError';

  constructor(message?: string) {
    super(14, message ?? 'unable to publish data');
  }
}

export class PublishTrackError extends LivekitError {
  readonly name = 'PublishTrackError';

  status: number;

  constructor(message: string, status: number) {
    super(15, message);
    this.status = status;
  }
}

export type RequestErrorReason =
  | Exclude<RequestResponse_Reason, RequestResponse_Reason.OK>
  | 'TimeoutError';

export class SignalRequestError extends LivekitError {
  readonly name = 'SignalRequestError';

  reason: RequestErrorReason;

  reasonName: string;

  constructor(message: string, reason: RequestErrorReason) {
    super(15, message);
    this.reason = reason;
    this.reasonName = typeof reason === 'string' ? reason : RequestResponse_Reason[reason];
  }
}

// NOTE: matches with https://github.com/livekit/client-sdk-swift/blob/f37bbd260d61e165084962db822c79f995f1a113/Sources/LiveKit/DataStream/StreamError.swift#L17
export enum DataStreamErrorReason {
  // Unable to open a stream with the same ID more than once.
  AlreadyOpened = 0,

  // Stream closed abnormally by remote participant.
  AbnormalEnd = 1,

  // Incoming chunk data could not be decoded.
  DecodeFailed = 2,

  // Read length exceeded total length specified in stream header.
  LengthExceeded = 3,

  // Read length less than total length specified in stream header.
  Incomplete = 4,

  // Unable to register a stream handler more than once.
  HandlerAlreadyRegistered = 7,

  // Encryption type mismatch.
  EncryptionTypeMismatch = 8,
}

export class DataStreamError extends LivekitError {
  readonly name = 'DataStreamError';

  reason: DataStreamErrorReason;

  reasonName: string;

  constructor(message: string, reason: DataStreamErrorReason) {
    super(16, message);
    this.reason = reason;
    this.reasonName = DataStreamErrorReason[reason];
  }
}

export class SignalReconnectError extends LivekitError {
  readonly name = 'SignalReconnectError';

  constructor(message?: string) {
    super(18, message);
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
