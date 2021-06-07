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
