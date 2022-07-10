import { ReconnectContext, ReconnectPolicy } from './ReconnectPolicy';

const DEFAULT_RETRY_DELAYS_IN_MS = [
  0,
  300,
  2 * 2 * 300,
  3 * 3 * 300,
  4 * 4 * 300,
  5 * 5 * 300,
  6 * 6 * 300,
  7 * 7 * 300,
  8 * 8 * 300,
  9 * 9 * 300,
];

class DefaultReconnectPolicy implements ReconnectPolicy {
  private readonly _retryDelays: number[];

  constructor(retryDelays?: number[]) {
    this._retryDelays = retryDelays !== undefined ? [...retryDelays] : DEFAULT_RETRY_DELAYS_IN_MS;
  }

  public nextRetryDelayInMs(context: ReconnectContext): number | null {
    if (context.retryCount === this._retryDelays.length) return null;

    const retryDelay = this._retryDelays[context.retryCount];
    if (context.retryCount <= 1) return retryDelay;

    return retryDelay + Math.random() * 1_000;
  }
}

export default DefaultReconnectPolicy;
