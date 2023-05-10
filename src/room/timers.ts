/**
 * Timers that can be overridden with platform specific implementations
 * that ensure that they are fired. These should be used when it is critical
 * that the timer fires on time.
 */
export default class CriticalTimers {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  static setTimeout = (...args: Parameters<typeof setTimeout>) => setTimeout(...args);

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  static setInterval = (...args: Parameters<typeof setInterval>) => setInterval(...args);

  static clearTimeout = (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args);

  static clearInterval = (...args: Parameters<typeof clearInterval>) => clearInterval(...args);
}
