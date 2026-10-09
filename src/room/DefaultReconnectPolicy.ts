import type { ReconnectContext, ReconnectPolicy } from './ReconnectPolicy';

const maxRetryDelay = 7000;

/**
 * Upper bound of the random delay added to the first retry, whose base delay is 0. It keeps a
 * brief network blip recovering quickly while spreading out clients that disconnect together.
 */
const maxFirstRetryJitterInMs = 500;

const DEFAULT_RETRY_DELAYS_IN_MS = [
  0,
  300,
  2 * 2 * 300,
  3 * 3 * 300,
  4 * 4 * 300,
  maxRetryDelay,
  maxRetryDelay,
  maxRetryDelay,
  maxRetryDelay,
  maxRetryDelay,
];

class DefaultReconnectPolicy implements ReconnectPolicy {
  private readonly _retryDelays: number[];

  constructor(retryDelays?: number[]) {
    this._retryDelays = retryDelays !== undefined ? [...retryDelays] : DEFAULT_RETRY_DELAYS_IN_MS;
  }

  public nextRetryDelayInMs(context: ReconnectContext): number | null {
    if (context.retryCount >= this._retryDelays.length) return null;

    const retryDelay = this._retryDelays[context.retryCount];

    // The first retry has no base delay to scale, so it gets a fixed window instead. A zero at a
    // later index is an explicit request for an immediate retry and passes through the formula as zero.
    if (context.retryCount === 0 && retryDelay === 0) {
      return Math.random() * maxFirstRetryJitterInMs;
    }

    // Jitter scales with the delay (+/-50%) so clients spread out further on later retries.
    return Math.round(retryDelay * (0.5 + Math.random()));
  }
}

export default DefaultReconnectPolicy;
