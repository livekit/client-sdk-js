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
  TokenSource = 'livekit-token-source',
  Participant = 'livekit-participant',
  Track = 'livekit-track',
  Publication = 'livekit-track-publication',
  Engine = 'livekit-engine',
  Signal = 'livekit-signal',
  PCManager = 'livekit-pc-manager',
  PCTransport = 'livekit-pc-transport',
  E2EE = 'lk-e2ee',
  DataTracks = 'livekit-data-tracks',
  Region = 'livekit-region',
  ICE = 'livekit-ice',
  Stats = 'livekit-stats',
}

type LogLevelString = keyof typeof LogLevel;

export type StructuredLogger = log.Logger & {
  trace: (msg: string, context?: object) => void;
  debug: (msg: string, context?: object) => void;
  info: (msg: string, context?: object) => void;
  warn: (msg: string, context?: object) => void;
  error: (msg: string, context?: object) => void;
  setDefaultLevel: (level: log.LogLevelDesc) => void;
  setLevel: (level: log.LogLevelDesc) => void;
  getLevel: () => number;
};

export type ContextProvider = () => object | undefined;

let livekitLogger = log.getLogger(LoggerNames.Default);
const livekitLoggers = Object.values(LoggerNames).map((name) => log.getLogger(name));

livekitLogger.setDefaultLevel(LogLevel.info);

export default livekitLogger as StructuredLogger;

/**
 * @internal Receives every warn/error line of the SDK's loggers whatever their console level
 * (telemetry). The console gets what it got before; the devtools call site becomes the forwarder.
 */
export type LogCapture = (
  level: LogLevel,
  msg: unknown,
  context?: object,
  loggerName?: string,
) => void;

let logCapture: LogCapture | undefined;

/**
 * @internal The object a line is about (a Room's telemetry scope), carried through the structured
 * context without being enumerable: the console and log extensions see the context as before.
 */
export const LOG_OWNER: unique symbol = Symbol('livekit.logOwner');

/** @internal */
export function setLogCapture(capture?: LogCapture) {
  logCapture = capture;
}

const captured = new WeakSet<log.Logger>();

type CapturedMethod = ((...args: unknown[]) => void) & { lkForwards?: boolean };

function forwarder(logger: log.Logger, method: 'warn' | 'error'): CapturedMethod {
  const real = logger[method] as CapturedMethod;
  if (real.lkForwards) return real;
  const name = (logger as { name?: string }).name;
  const forward: CapturedMethod = (...args) => {
    try {
      const context = typeof args[1] === 'object' && args[1] !== null ? args[1] : undefined;
      // Whatever path a context took here, the console never lists the owner.
      if (context && Object.getOwnPropertyDescriptor(context, LOG_OWNER)?.enumerable) {
        Object.defineProperty(context, LOG_OWNER, { enumerable: false });
      }
      logCapture?.(LogLevel[method], args[0], context, name);
    } catch {
      // telemetry never breaks logging
    }
    real(...args); // the original call, argument for argument
  };
  forward.lkForwards = true;
  return forward;
}

// loglevel assigns `warn`/`error` anew on every `setLevel` (a noop below the level), so the
// forwarder is re-applied after each `setLevel` and runs before whatever loglevel assigned.
function captureWarnings(logger: log.Logger) {
  if (captured.has(logger)) return;
  captured.add(logger);
  const wrap = () => {
    logger.warn = forwarder(logger, 'warn');
    logger.error = forwarder(logger, 'error');
  };
  // `setLevel`, `resetLevel` and `rebuild` all reassign the methods.
  const target = logger as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const name of ['setLevel', 'resetLevel', 'rebuild']) {
    const original = target[name];
    if (typeof original !== 'function') continue;
    target[name] = (...args: unknown[]) => {
      const result = original.apply(logger, args);
      wrap();
      return result;
    };
  }
  wrap();
}

livekitLoggers.forEach(captureWarnings);

/**
 * @internal
 *
 * Get a named logger. When `ctxFn` is supplied, every log call
 * automatically:
 * 1. prepends a `[key=value ...]` prefix derived from `ctxFn()` to the
 *    message string, so identifiers are visible in browser devtools
 *    without expanding the structured context object, and
 * 2. merges `ctxFn()` into the structured context passed to any
 *    `setLogExtension` consumer, so ingestion pipelines continue to
 *    receive the full metadata unchanged.
 */
export function getLogger(name: string, ctxFn?: ContextProvider) {
  const logger = log.getLogger(name);
  logger.setDefaultLevel(livekitLogger.getLevel());
  captureWarnings(logger);
  if (!ctxFn) {
    return logger as StructuredLogger;
  }
  return wrapWithContext(logger as StructuredLogger, ctxFn);
}

function wrapWithContext(base: StructuredLogger, ctxFn: ContextProvider): StructuredLogger {
  type LogMethod = 'trace' | 'debug' | 'info' | 'warn' | 'error';
  // Resolve the underlying method on every call so that later
  // setLogExtension installations (which replace the base logger's
  // methods via loglevel's methodFactory) are picked up.
  const wrap = (method: LogMethod) => (msg: string, extra?: object) => {
    const ctx = ctxFn();
    const merged = ctx || extra ? { ...ctx, ...extra } : undefined;
    const owner = (ctx as Record<symbol, unknown> | undefined)?.[LOG_OWNER];
    if (merged && owner)
      Object.defineProperty(merged, LOG_OWNER, { value: owner, enumerable: false });
    base[method](msg, merged);
  };

  const proxy = Object.create(base) as StructuredLogger;
  proxy.trace = wrap('trace');
  proxy.debug = wrap('debug');
  proxy.info = wrap('info');
  proxy.warn = wrap('warn');
  proxy.error = wrap('error');
  return proxy;
}

export function setLogLevel(level: LogLevel | LogLevelString, loggerName?: LoggerNames) {
  if (loggerName) {
    log.getLogger(loggerName).setLevel(level);
  } else {
    for (const logger of livekitLoggers) {
      logger.setLevel(level);
    }
  }
}

export type LogExtension = (level: LogLevel, msg: string, context?: object) => void;

/**
 * use this to hook into the logging function to allow sending internal livekit logs to third party services
 * if set, the browser logs will lose their stacktrace information (see https://github.com/pimterry/loglevel#writing-plugins)
 */
export function setLogExtension(extension: LogExtension, logger?: StructuredLogger) {
  const loggers = logger ? [logger] : livekitLoggers;

  loggers.forEach((logR) => {
    const originalFactory = logR.methodFactory;

    logR.methodFactory = (methodName, configLevel, loggerName) => {
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
    logR.setLevel(logR.getLevel());
  });
}

export const workerLogger = log.getLogger(LoggerNames.E2EE) as StructuredLogger;

const workerLogLevelListeners = new Set<(level: LogLevel) => void>();

const originalWorkerSetLevel = workerLogger.setLevel.bind(workerLogger);
workerLogger.setLevel = ((level: log.LogLevelDesc, persist?: boolean) => {
  originalWorkerSetLevel(level, persist);
  const numeric = workerLogger.getLevel() as LogLevel;
  workerLogLevelListeners.forEach((cb) => cb(numeric));
}) as typeof workerLogger.setLevel;

/** @internal Subscribe to workerLogger level changes (so E2EE workers can be kept in sync). */
export function onWorkerLogLevelChanged(cb: (level: LogLevel) => void): () => void {
  workerLogLevelListeners.add(cb);
  return () => {
    workerLogLevelListeners.delete(cb);
  };
}

/** @internal Test-only accessor: current number of workerLogger level listeners. */
export function getWorkerLogLevelListenerCount(): number {
  return workerLogLevelListeners.size;
}
