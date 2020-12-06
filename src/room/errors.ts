export class LivekitError {
  code: number;
  message?: string;

  constructor(code: number, message?: string) {
    this.code = code;
    this.message = message;
  }
}

export class TrackInvalidError extends LivekitError {
  constructor(message?: string) {
    super(53300, message || 'Track is invalid');
  }
}
