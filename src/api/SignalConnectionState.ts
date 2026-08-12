/**
 * Signal Connection lifecycle state machine.
 *
 * Canonical implementation of specs/signal-connection.scxml — a pure Mealy
 * machine with NO extended state. `transition(status, event)` is a pure
 * function returning the next status plus the effects (commands) for an
 * executor to perform.
 *
 * The machine emits only the SCXML's lifecycle effect vocabulary. Everything
 * the spec excludes — endpoint/url reuse, message routing, buffering, failure
 * classification (validate), and promise/abort orchestration — lives in the
 * executor, not here. See specs/signal-connection.routing.md and
 * specs/signal-connection.buffer.md.
 */

export enum SignalConnectionStatus {
  NEW = 'new',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  SUSPENDED = 'suspended',
  RECONNECTING = 'reconnecting',
  DISCONNECTING = 'disconnecting',
  CLOSED = 'closed',
}

const S = SignalConnectionStatus;

export interface PingConfig {
  intervalS: number;
  timeoutS: number;
}

export interface ConnectionFailure {
  reason: string;
  message?: string;
  retryable: boolean;
  supportsRegionFailover: boolean;
}

/**
 * Events the machine accepts, as a discriminated union: each variant carries
 * exactly the payload its transitions need, so an event can't be constructed
 * without the data the effects will read.
 */
export type SignalEvent =
  | { type: 'connect'; url: string }
  // Phase-neutral: the executor reports *what happened*, and the table decides
  // what it means from the status it happened in. An `established` in
  // `reconnecting` is a resume; in `connecting` it is a first connection. An
  // `attempt_failed` ends a first connection but only suspends a reconnect.
  // Naming these per-phase would force the executor to re-derive the routing
  // the table already encodes.
  | { type: 'established'; pingConfig: PingConfig }
  | { type: 'attempt_failed' }
  | { type: 'attempt_timed_out' }
  | { type: 'transport_closed'; reason: string }
  | { type: 'ping_timeout' }
  | { type: 'start_reconnect' }
  | { type: 'leave_received_during_reconnect'; leaveAction: number }
  | { type: 'close' }
  | { type: 'close_completed' };

export type SignalEventType = SignalEvent['type'];

export type SignalEffectType =
  | 'open_transport'
  | 'start_ping'
  | 'stop_ping'
  | 'connection_lost'
  | 'close_transport'
  | 'reconnect_completed'
  | 'leave_received'
  | 'clear_queue';

/** A command emitted to the executor. Not an event routed within the machine. */
export interface SignalEffect {
  type: SignalEffectType;
  params?: Record<string, unknown>;
}

export interface TransitionResult {
  /** Whether the event was handled in the current status (false = ignored). */
  handled: boolean;
  nextStatus: SignalConnectionStatus;
  effects: SignalEffect[];
}

export const SIGNAL_STATUSES: SignalConnectionStatus[] = [
  S.NEW,
  S.CONNECTING,
  S.CONNECTED,
  S.SUSPENDED,
  S.RECONNECTING,
  S.DISCONNECTING,
  S.CLOSED,
];

// ---------------------------------------------------------------------------
// Failures — the payloads carried by connection_lost.
//
// connection_lost is emitted only when a connection that had reached `connected`
// is lost, so these are the only two ways that can happen. A failure *before*
// the connection was established settles the pending attempt instead; the
// machine does not describe it, because the executor already holds the
// classified error it will reject with.
// ---------------------------------------------------------------------------
const PING_TIMEOUT: ConnectionFailure = {
  reason: 'ping_timeout',
  message: 'ping timeout',
  retryable: true,
  supportsRegionFailover: false,
};

/**
 * An abnormal transport closure reports an empty reason rather than an absent
 * one, so a blank reason falls back to this notation. Consumers can rely on a
 * failure always carrying a non-empty message.
 */
const TRANSPORT_ERROR_FALLBACK = 'Unexpected WS error';

const transportError = (message: string): ConnectionFailure => ({
  reason: 'transport_error',
  message: message || TRANSPORT_ERROR_FALLBACK,
  retryable: true,
  supportsRegionFailover: false,
});

// ---------------------------------------------------------------------------
// Effect builders — keep the transition table flat and readable.
// ---------------------------------------------------------------------------
const openTransport = (url: string): SignalEffect => ({
  type: 'open_transport',
  params: { url, reconnect: false },
});
// On reconnect the executor reuses the endpoint from connect time, so no url.
const reconnectTransport = (): SignalEffect => ({
  type: 'open_transport',
  params: { reconnect: true },
});
const startPing = (config: PingConfig): SignalEffect => ({
  type: 'start_ping',
  params: { config },
});
const stopPing = (): SignalEffect => ({ type: 'stop_ping' });
const connectionLost = (failure: ConnectionFailure): SignalEffect => ({
  type: 'connection_lost',
  params: { failure },
});
const closeTransport = (): SignalEffect => ({ type: 'close_transport' });
const reconnectCompleted = (): SignalEffect => ({ type: 'reconnect_completed' });
const leaveReceived = (leaveAction: number): SignalEffect => ({
  type: 'leave_received',
  params: { leaveAction },
});
const clearQueue = (): SignalEffect => ({ type: 'clear_queue' });

// ---------------------------------------------------------------------------
// Transition table.
//
// Each entry is `{ target, effects }`. `effects` is a plain array, or a
// function of the event when an effect needs the event's payload — in which
// case the event is narrowed to the variant that keys the entry, so payload
// access is checked. A missing entry means the event is unhandled in that
// status (silently ignored).
//
// Effects that belong to *leaving* or *entering* a status live in ON_EXIT and
// ON_ENTRY below rather than being repeated on each edge.
// ---------------------------------------------------------------------------
interface Transition<E extends SignalEventType> {
  target: SignalConnectionStatus;
  effects?: SignalEffect[] | ((event: Extract<SignalEvent, { type: E }>) => SignalEffect[]);
}

type StatusTransitions = { [E in SignalEventType]?: Transition<E> };

const TABLE: Record<SignalConnectionStatus, StatusTransitions> = {
  [S.NEW]: {
    connect: { target: S.CONNECTING, effects: (e) => [openTransport(e.url)] },
  },

  // No connection_lost on any edge here: nothing was ever established, so the
  // outcome belongs to the pending attempt, not to a disconnect notification.
  [S.CONNECTING]: {
    established: { target: S.CONNECTED, effects: (e) => [startPing(e.pingConfig)] },
    attempt_failed: { target: S.CLOSED },
    attempt_timed_out: { target: S.CLOSED },
    // transport dropped before the connection was established
    transport_closed: { target: S.CLOSED },
    // abort an in-flight connection attempt
    close: { target: S.CLOSED, effects: [closeTransport()] },
  },

  // stop_ping is not listed on these edges: it is an exit action of connected.
  [S.CONNECTED]: {
    transport_closed: {
      target: S.SUSPENDED,
      effects: (e) => [connectionLost(transportError(e.reason))],
    },
    ping_timeout: { target: S.SUSPENDED, effects: [connectionLost(PING_TIMEOUT)] },
    start_reconnect: { target: S.RECONNECTING, effects: [reconnectTransport()] },
    close: { target: S.DISCONNECTING, effects: [closeTransport()] },
  },

  [S.SUSPENDED]: {
    start_reconnect: { target: S.RECONNECTING, effects: [reconnectTransport()] },
    // transport already lost; nothing to close. onEntry(closed) flushes buffer.
    close: { target: S.CLOSED, effects: [] },
  },

  [S.RECONNECTING]: {
    established: {
      target: S.CONNECTED,
      effects: (e) => [reconnectCompleted(), startPing(e.pingConfig)],
    },
    // A failed attempt parks in suspended so the orchestrator can retry. No
    // connection_lost: the caller already learned of the loss when the
    // connection first dropped, and this attempt's own rejection reports the rest.
    attempt_failed: { target: S.SUSPENDED },
    attempt_timed_out: { target: S.SUSPENDED },
    leave_received_during_reconnect: {
      target: S.CLOSED,
      effects: (e) => [leaveReceived(e.leaveAction)],
    },
    // abort a reconnect in progress
    close: { target: S.CLOSED, effects: [closeTransport()] },
  },

  [S.DISCONNECTING]: {
    close_completed: { target: S.CLOSED, effects: [] },
    // transport dropped instead of closing cleanly — don't hang here
    transport_closed: { target: S.CLOSED, effects: [] },
  },

  [S.CLOSED]: {},
};

/** Effects emitted on exit from a status, regardless of which edge is taken. */
const ON_EXIT: Partial<Record<SignalConnectionStatus, SignalEffect[]>> = {
  // Leaving connected disarms the keepalive timer. Stated once here so that a
  // new edge out of connected cannot forget it and leak the timer.
  [S.CONNECTED]: [stopPing()],
};

/** Effects emitted on entry to a status, regardless of which event caused it. */
const ON_ENTRY: Partial<Record<SignalConnectionStatus, SignalEffect[]>> = {
  // Entering the terminal status flushes the executor's message buffer.
  [S.CLOSED]: [clearQueue()],
};

/**
 * Pure transition function. Never mutates.
 *
 * Effects are ordered exit → transition → entry, matching SCXML, so a status's
 * teardown always precedes the effects of the edge that left it.
 */
export function transition(status: SignalConnectionStatus, event: SignalEvent): TransitionResult {
  // The table is keyed by event type, so narrowing is lost on lookup; the entry
  // was declared against this event's own variant.
  const entry = TABLE[status][event.type] as Transition<SignalEventType> | undefined;
  if (!entry) {
    return { handled: false, nextStatus: status, effects: [] };
  }
  const { target } = entry;
  const own =
    typeof entry.effects === 'function'
      ? (entry.effects as (e: SignalEvent) => SignalEffect[])(event)
      : (entry.effects ?? []);
  const changed = target !== status;
  const onExit = changed ? (ON_EXIT[status] ?? []) : [];
  const onEntry = changed ? (ON_ENTRY[target] ?? []) : [];
  return { handled: true, nextStatus: target, effects: [...onExit, ...own, ...onEntry] };
}

// ---------------------------------------------------------------------------
// Message routing — a projection of the lifecycle status, not a transition.
//
// Implements specs/signal-connection.routing.md. Routing never changes the
// status, which is why it is a lookup here rather than a set of targetless
// self-transitions in the table: encoding it there added no lifecycle semantics
// and was the machine's only source of extended state.
// ---------------------------------------------------------------------------

/** Chosen by the caller from the message type, never from the status. */
export type MessageKind = 'passthrough' | 'queueable';

export type MessageRoute = 'dispatch' | 'buffer' | 'drop' | 'reject';

/**
 * Where a message goes, given the current status.
 *
 * `bufferEmpty` only matters for a queueable message while connected: if a
 * drain is still pending, dispatching immediately would let the new message
 * overtake older buffered ones and break FIFO, so it appends instead.
 *
 * - `dispatch` hand to the open transport now
 * - `buffer`   append to the executor's buffer, flushed in order on drain
 * - `drop`     silently discard; correct for passthrough with no live transport
 * - `reject`   the status structurally cannot serve this message
 */
export function routeMessage(
  status: SignalConnectionStatus,
  kind: MessageKind,
  bufferEmpty: boolean,
): MessageRoute {
  if (kind === 'passthrough') {
    switch (status) {
      case S.CONNECTING:
      case S.CONNECTED:
      case S.RECONNECTING:
        return 'dispatch';
      default:
        // new, suspended, disconnecting, closed: a passthrough message that
        // cannot be sent now is never sent.
        return 'drop';
    }
  }
  switch (status) {
    case S.CONNECTED:
      return bufferEmpty ? 'dispatch' : 'buffer';
    case S.SUSPENDED:
    case S.RECONNECTING:
      return 'buffer';
    default:
      // new, connecting, disconnecting, closed
      return 'reject';
  }
}

/** Events that are handled (cause a transition) in the given status. */
export function handledEvents(status: SignalConnectionStatus): SignalEventType[] {
  return Object.keys(TABLE[status]) as SignalEventType[];
}

/** Static edge list (from → to, labelled by event) for visualization/tooling. */
export function signalEdges(): Array<{
  from: SignalConnectionStatus;
  to: SignalConnectionStatus;
  event: SignalEventType;
}> {
  const result: Array<{
    from: SignalConnectionStatus;
    to: SignalConnectionStatus;
    event: SignalEventType;
  }> = [];
  for (const from of SIGNAL_STATUSES) {
    for (const event of handledEvents(from)) {
      // Read the target from the table rather than driving a transition: an
      // edge's target never depends on the event's payload.
      const to = (TABLE[from][event] as Transition<SignalEventType>).target;
      result.push({ from, to, event });
    }
  }
  return result;
}
