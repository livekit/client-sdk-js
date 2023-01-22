/**
 * Timers that can be overridden with platform specific implementations.
 */
export default class Timers {
  static setTimeout = setTimeout;

  static setInterval = setInterval;

  static clearTimeout = clearTimeout;

  static clearInterval = clearInterval;
}
