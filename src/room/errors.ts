export class LivekitError extends Error {
  code: number;

  constructor(code: number, message?: string) {
    super(message || 'an error has occured');
    this.code = code;
  }
}

export class ConnectionError extends LivekitError {
  constructor(message?: string) {
    super(1, message);
  }
}

export class TrackInvalidError extends LivekitError {
  constructor(message?: string) {
    super(20, message || 'Track is invalid');
  }
}

export class UnsupportedServer extends LivekitError {
  constructor(message?: string) {
    super(10, message || 'Unsupported server');
  }
}

export class UnexpectedConnectionState extends LivekitError {
  constructor(message?: string) {
    super(12, message || 'Unexpected connection state');
  }
}

export class PublishDataError extends LivekitError {
  constructor(message?: string) {
    super(13, message || 'Unable to publish data');
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
  export function getFailure(error: any): MediaDeviceFailure {
    if (error.name) {
      if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        return MediaDeviceFailure.NotFound;
      }
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return MediaDeviceFailure.PermissionDenied;
      }
      if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        return MediaDeviceFailure.DeviceInUse;
      }
    }
    return MediaDeviceFailure.Other;
  }
}
