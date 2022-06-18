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
