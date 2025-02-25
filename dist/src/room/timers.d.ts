/**
 * Timers that can be overridden with platform specific implementations
 * that ensure that they are fired. These should be used when it is critical
 * that the timer fires on time.
 */
export default class CriticalTimers {
    static setTimeout: (...args: Parameters<typeof setTimeout>) => ReturnType<typeof setTimeout>;
    static setInterval: (...args: Parameters<typeof setInterval>) => ReturnType<typeof setInterval>;
    static clearTimeout: (...args: Parameters<typeof clearTimeout>) => ReturnType<typeof clearTimeout>;
    static clearInterval: (...args: Parameters<typeof clearInterval>) => ReturnType<typeof clearInterval>;
}
//# sourceMappingURL=timers.d.ts.map