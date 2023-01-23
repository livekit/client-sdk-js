/**
 * Timers that can be overridden with platform specific implementations
 * that ensure that they are fired. These should be used when it is critical
 * that the timer fires on time.
 */
export default class CriticalTimers {
  static setTimeout = setTimeout;

  static setInterval = setInterval;

  static clearTimeout = clearTimeout;

  static clearInterval = clearInterval;
}
