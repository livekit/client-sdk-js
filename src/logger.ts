import log from 'loglevel';

export type LogLevelDesc = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export enum LogLevel {
  trace = 'trace',
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
  silent = 'silent',
}

const livekitLogger = log.getLogger('livekit');

export default livekitLogger;

export function setLogLevel(level: LogLevel | LogLevelDesc) {
  livekitLogger.setLevel(level);
}
