import { IReconnectPolicy, ReconnectContext } from './IReconnectPolicy';

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
  null,
];

class DefaultReconnectPolicy implements IReconnectPolicy {
  private readonly _retryDelays: (number | null)[];

  constructor(retryDelays?: number[]) {
    this._retryDelays =
      retryDelays !== undefined ? [...retryDelays, null] : DEFAULT_RETRY_DELAYS_IN_MS;
  }

  public nextRetryDelayInMs(context: ReconnectContext): number | null {
    const retryDelay = this._retryDelays[context.retryCount];
    if (!retryDelay || context.retryCount <= 1) return retryDelay;

    return retryDelay + Math.random() * 1_000;
  }
}

export default DefaultReconnectPolicy;
