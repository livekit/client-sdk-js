/**
 * Serialized event intake for the signal connection lifecycle machine.
 *
 * `transition()` in ./SignalConnectionState is pure, which makes transitions
 * verifiable but says nothing about *ordering*. This runner supplies the
 * ordering guarantee: it owns the current status, is the only writer of it, and
 * processes events one at a time to completion.
 *
 * The property that matters: there is never an `await` between reading the
 * status and writing it. Callers hand events in and the status advances
 * synchronously, so an async operation that settles late cannot interleave a
 * status write and clobber a status set in the meantime — the failure mode that
 * lets a slow teardown overwrite a reconnect already in progress.
 *
 * Modelled on the engine task in client-sdk-esp32, where every callback posts to
 * a queue that a single task drains one event per iteration. Same discipline,
 * minus the threads: a re-entrant send from inside an effect handler is queued
 * rather than recursed, so each event's effects are fully dispatched before the
 * next event is considered.
 */
import {
  SignalConnectionStatus,
  type SignalEffect,
  type SignalEvent,
  transition,
} from './SignalConnectionState';

/** Receives the effects produced by one event, in order. */
export type SignalEffectSink = (effects: SignalEffect[]) => void;

export interface SignalConnectionRunnerOptions {
  /** Status to start from. Defaults to the machine's initial status. */
  initialStatus?: SignalConnectionStatus;
  /** Called once per actual status change, after that event's effects are dispatched. */
  onStatusChanged?: (status: SignalConnectionStatus, previous: SignalConnectionStatus) => void;
  /** Called when an event is not handled in the current status (silently ignored). */
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

  /** Events queued but not yet processed. Non-zero only during a re-entrant send. */
  get queueDepth(): number {
    return this.pending.length;
  }

  /**
   * Submit an event. Processed immediately unless a drain is already in
   * progress, in which case it is queued and handled once the current event
   * completes.
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
      // Cleared even if a sink throws, so one failing effect handler cannot
      // wedge the runner and silently swallow every later event.
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

    // Single writer, and committed before the effects run so that an effect
    // handler reading `status` observes the status it is acting on behalf of.
    this.currentStatus = result.nextStatus;

    if (result.effects.length > 0) {
      this.sink(result.effects);
    }

    if (result.nextStatus !== previous) {
      this.options.onStatusChanged?.(result.nextStatus, previous);
    }
  }
}
