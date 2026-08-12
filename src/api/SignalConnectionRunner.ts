/**
 * Serialized event intake for the signal connection lifecycle machine.
 *
 * `transition()` in ./SignalConnectionState is pure. That makes each transition
 * correct, but it says nothing about order. This runner gives the order: it holds
 * the status, it is the only writer of the status, and it does one event at a
 * time until that event is complete.
 *
 * There is no `await` between a read of the status and a write of the status.
 * The status moves while the caller waits. An operation that completes late
 * cannot then write a status and remove a status that a newer event set.
 *
 * The model is the engine task in client-sdk-esp32. Each callback there posts to
 * a queue, and one task reads one event per cycle. This runner does the same
 * without threads. If an effect handler sends a new event, the runner queues it.
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
  /** Called after each change of status, and after the effects of that event. */
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

  /** The events in the queue. This is more than 0 only during a nested send. */
  get queueDepth(): number {
    return this.pending.length;
  }

  /**
   * Submit an event. The runner does the event now, unless it is busy with an
   * earlier event. In that case it queues the event and does it after the
   * earlier one is complete.
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
      // Clear the flag even if a sink throws. If the flag stays set, the runner
      // discards all later events.
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

    // Write the status before the effects. An effect handler that reads the
    // status must see the status that it acts for.
    this.currentStatus = result.nextStatus;

    if (result.effects.length > 0) {
      this.sink(result.effects);
    }

    if (result.nextStatus !== previous) {
      this.options.onStatusChanged?.(result.nextStatus, previous);
    }
  }
}
