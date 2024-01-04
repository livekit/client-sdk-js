import * as log from 'loglevel';

export enum LogLevel {
  trace = 0,
  debug = 1,
  info = 2,
  warn = 3,
  error = 4,
  silent = 5,
}

export enum LoggerNames {
  Default = 'livekit',
  Room = 'livekit-room',
  Participant = 'livekit-participant',
  Track = 'livekit-track',
  Publication = 'livekit-track-publication',
  Engine = 'livekit-engine',
  Signal = 'livekit-signal',
  PCManager = 'livekit-pc-manager',
  PCTransport = 'livekit-pc-transport',
  E2EE = 'lk-e2ee',
}

type LogLevelString = keyof typeof LogLevel;

export type StructuredLogger = {
  trace: (msg: string, context?: object) => void;
  debug: (msg: string, context?: object) => void;
  info: (msg: string, context?: object) => void;
  warn: (msg: string, context?: object) => void;
  error: (msg: string, context?: object) => void;
  setDefaultLevel: (level: log.LogLevelDesc) => void;
};

let livekitLogger = log.getLogger('livekit');

livekitLogger.setDefaultLevel(LogLevel.info);

export default livekitLogger as StructuredLogger;

/**
 * @internal
 */
export function getLogger(name: string) {
  const logger = log.getLogger(name);
  logger.setDefaultLevel(livekitLogger.getLevel());
  return logger as StructuredLogger;
}

export function setLogLevel(level: LogLevel | LogLevelString, loggerName?: LoggerNames) {
  if (loggerName) {
    log.getLogger(loggerName).setLevel(level);
  }
  for (const logger of Object.entries(log.getLoggers())
    .filter(([logrName]) => logrName.startsWith('livekit'))
    .map(([, logr]) => logr)) {
    logger.setLevel(level);
  }
}

export type LogExtension = (level: LogLevel, msg: string, context?: object) => void;

/**
 * use this to hook into the logging function to allow sending internal livekit logs to third party services
 * if set, the browser logs will lose their stacktrace information (see https://github.com/pimterry/loglevel#writing-plugins)
 */
export function setLogExtension(extension: LogExtension, logger = livekitLogger) {
  const originalFactory = logger.methodFactory;

  logger.methodFactory = (methodName, configLevel, loggerName) => {
    const rawMethod = originalFactory(methodName, configLevel, loggerName);

    const logLevel = LogLevel[methodName as LogLevelString];
    const needLog = logLevel >= configLevel && logLevel < LogLevel.silent;

    return (msg, context?: [msg: string, context: object]) => {
      if (context) rawMethod(msg, context);
      else rawMethod(msg);
      if (needLog) {
        extension(logLevel, msg, context);
      }
    };
  };
  logger.setLevel(logger.getLevel()); // Be sure to call setLevel method in order to apply plugin
}

export const workerLogger = log.getLogger('lk-e2ee') as StructuredLogger;
