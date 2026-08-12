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

/** Receives the effects of one event, in order. */
export type SignalEffectSink = (effects: SignalEffect[]) => void;

export interface SignalConnectionRunnerOptions {
  /** The first status. The default is the initial status of the machine. */
  initialStatus?: SignalConnectionStatus;
  /** Called after each status change, after that event's effects. */
  onStatusChanged?: (status: SignalConnectionStatus, previous: SignalConnectionStatus) => void;
  /** Called if the current status does not handle the event. */
  onIgnored?: (event: SignalEvent, status: SignalConnectionStatus) => void;
}

export class SignalConnectionRunner {
  private currentStatus: SignalConnectionStatus;

  private readonly pending: SignalEvent[] = [];

  private draining = false;

  private readonly sink: SignalEffectSink;

  private readonly options: SignalConnectionRunnerOptions;

  constructor(sink: SignalEffectSink, options: SignalConnectionRunnerOptions = {}) {
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
  send(event: SignalEvent): void {
    this.pending.push(event);
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      while (this.pending.length > 0) {
        this.step(this.pending.shift()!);
      }
    } finally {
      // Clear the flag even if a sink throws, or the runner discards all later
      // events.
      this.draining = false;
      this.pending.length = 0;
    }
  }

  private step(event: SignalEvent): void {
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
      this.sink(result.effects);
    }

    if (result.nextStatus !== previous) {
      this.options.onStatusChanged?.(result.nextStatus, previous);
    }
  }
}
