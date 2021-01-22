export interface ConnectOptions {
  // name of the room to join
  logLevel?: LogLevel;
}

export enum LogLevel {
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
  silent = 'silent',
}

export interface CreateLocalTracksOptions {
  audio?: boolean | CreateLocalTrackOptions;
  logLevel?: LogLevel;
  video?: boolean | CreateLocalTrackOptions;
}

export interface CreateLocalTrackOptions extends MediaTrackConstraints {
  logLevel?: LogLevel;
  name?: string;
}
