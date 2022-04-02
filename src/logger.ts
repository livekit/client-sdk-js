import log, { LogLevelNumbers } from 'loglevel';

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

livekitLogger.setLevel(LogLevel.info);

export default livekitLogger;

export function setLogLevel(level: LogLevel | LogLevelDesc) {
  livekitLogger.setLevel(level);
}

export type LogExtension = (level: LogLevelNumbers, ...msg: any[]) => void;

export function setLogExtension(extension: LogExtension) {
  const originalFactory = livekitLogger.methodFactory;

  livekitLogger.methodFactory = (methodName, logLevel, loggerName) => {
    const rawMethod = originalFactory(methodName, logLevel, loggerName);

    // @ts-ignore
    const levelVal = livekitLogger.levels[methodName.toUpperCase()];
    const configLevel = livekitLogger.getLevel();
    const needLog = levelVal >= configLevel;

    return (...args) => {
      if (needLog) {
        extension(logLevel, ...args);
      }

      rawMethod(...args);
    };
  };
  livekitLogger.setLevel(livekitLogger.getLevel()); // Be sure to call setLevel method in order to apply plugin
}
