/** Controls reconnecting of the client */
export interface IReconnectPolicy {
  /** Called after disconnect was detected
   *
   * @returns {number | null} Amount of time in milliseconds to delay the next reconnect attempt, `null` signals to stop retrying.
   */
  nextRetryDelayInMs(context: IReconnectContext): number | null;
}

export interface IReconnectContext {
  /**
   * Number of failed reconnect attempts
   */
  readonly retryCount: number;

  /**
   * Elapsed amount of time in milliseconds since the disconnect.
   */
  readonly elapsedMs: number;

  /**
   * Reason for retrying
   */
  readonly retryReason?: Error;
}

export class ReconnectContext implements IReconnectContext {
  public readonly elapsedMs: number;

  public readonly retryCount: number;

  public readonly retryReason?: Error;

  constructor(elapsedMilliseconds: number, retryCount: number, retryReason?: Error) {
    this.elapsedMs = elapsedMilliseconds;
    this.retryCount = retryCount;
    this.retryReason = retryReason;
  }
}
