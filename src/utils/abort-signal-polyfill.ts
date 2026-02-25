/**
 * Implementation of AbortSignal.any
 * Creates a signal that will be aborted when any of the given signals is aborted.
 * @link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any
 */
export function abortSignalAny(signals: Array<AbortSignal>): AbortSignal {
  // Handle empty signals array
  if (signals.length === 0) {
    const controller = new AbortController();
    return controller.signal;
  }

  // Fast path for single signal
  if (signals.length === 1) {
    return signals[0];
  }

  // Check if any signal is already aborted
  for (const signal of signals) {
    if (signal.aborted) {
      return signal;
    }
  }

  // Create a new controller for the combined signal
  const controller = new AbortController();
  const unlisteners: Array<() => void> = Array(signals.length);

  // Function to clean up all event listeners
  const cleanup = () => {
    for (const unsubscribe of unlisteners) {
      unsubscribe();
    }
  };

  // Add event listeners to each signal
  signals.forEach((signal, index) => {
    const handler = () => {
      controller.abort(signal.reason);
      cleanup();
    };

    signal.addEventListener('abort', handler);
    unlisteners[index] = () => signal.removeEventListener('abort', handler);
  });

  return controller.signal;
}

/**
 * Implementation of AbortSignal.timeout
 * Creates a signal that will be aborted after the specified timeout.
 * @link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout
 */
export function abortSignalTimeout(ms: number): AbortSignal {
  const controller = new AbortController();

  setTimeout(() => {
    controller.abort(
      new DOMException(`signal timed out after ${ms} ms`, 'TimeoutError'),
    );
  }, ms);

  return controller.signal;
}
