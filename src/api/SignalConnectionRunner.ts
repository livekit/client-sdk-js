/**
 * Serialized event intake for the lifecycle machine.
 *
 * `transition` is pure, so each transition is correct, but it says nothing about
 * order. This runner is the only writer of the status, and it does one event at a
 * time until that event is complete. There is no `await` between a read and a
 * write of the status, so an operation that completes late cannot overwrite a
 * status that a newer event set. A nested send from an effect handler is queued.
 * The model is the engine task in client-sdk-esp32.
 */
import {
  SignalConnectionStatus,
  type SignalEffect,
  type SignalEvent,
  transition,
} from './SignalConnectionState';

/**
 * Receives the effects of one event, in order, with the context that the sender
 * gave to `send`. An effect that needs a parameter gets it from the context. The
 * context travels with its own event, so a nested send cannot overwrite it.
 */
export type SignalEffectSink<Context> = (
  effects: SignalEffect[],
  context: Context | undefined,
) => void;

export interface SignalConnectionRunnerOptions {
  /** The first status. The default is the initial status of the machine. */
  initialStatus?: SignalConnectionStatus;
  /** Called after each status change, after that event's effects. */
  onStatusChanged?: (status: SignalConnectionStatus, previous: SignalConnectionStatus) => void;
  /** Called if the current status does not handle the event. */
  onIgnored?: (event: SignalEvent, status: SignalConnectionStatus) => void;
}

export class SignalConnectionRunner<Context = void> {
  private currentStatus: SignalConnectionStatus;

  private readonly pending: Array<{ event: SignalEvent; context?: Context }> = [];

  private draining = false;

  private readonly sink: SignalEffectSink<Context>;

  private readonly options: SignalConnectionRunnerOptions;

  constructor(sink: SignalEffectSink<Context>, options: SignalConnectionRunnerOptions = {}) {
    this.sink = sink;
    this.options = options;
    this.currentStatus = options.initialStatus ?? SignalConnectionStatus.NEW;
  }

  get status(): SignalConnectionStatus {
    return this.currentStatus;
  }

  /** Queued events. More than 0 only during a nested send. */
  get queueDepth(): number {
    return this.pending.length;
  }

  /**
   * Submit an event. The runner does it now, or queues it if an earlier event is
   * still in progress.
   */
  send(event: SignalEvent, context?: Context): void {
    this.pending.push({ event, context });
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      while (this.pending.length > 0) {
        const next = this.pending.shift()!;
        this.step(next.event, next.context);
      }
    } finally {
      // Clear the flag even if a sink throws. Keep the queue: the events behind
      // the failed one are still valid, and the next send drains them.
      this.draining = false;
    }
  }

  private step(event: SignalEvent, context: Context | undefined): void {
    const previous = this.currentStatus;
    const result = transition(previous, event);

    if (!result.handled) {
      this.options.onIgnored?.(event, previous);
      return;
    }

    // Write the status before the effects: a handler that reads the status must
    // see the status it acts for.
    this.currentStatus = result.nextStatus;

    if (result.effects.length > 0) {
      this.sink(result.effects, context);
    }

    if (result.nextStatus !== previous) {
      this.options.onStatusChanged?.(result.nextStatus, previous);
    }
  }
}
