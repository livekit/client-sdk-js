/**
 * Signal connection lifecycle machine, per specs/signal-connection.scxml.
 *
 * The machine has no extended state. `transition` is pure: it returns the next
 * status and the effects for the executor. `routeMessage` is a projection of the
 * status, not a transition. See signal-connection.routing.md and .buffer.md.
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

export interface ConnectionFailure {
  reason: string;
  message: string;
  retryable: boolean;
  supportsRegionFailover: boolean;
}

/**
 * The events are phase-neutral: the status decides what an event means, so
 * `established` is a resume in `reconnecting` and a first connection in
 * `connecting`. An event carries data only if a transition reads it.
 */
export type SignalEvent =
  | { type: 'connect' }
  | { type: 'established' }
  | { type: 'attempt_failed' }
  | { type: 'attempt_timed_out' }
  | { type: 'transport_closed'; reason: string }
  | { type: 'ping_timeout' }
  | { type: 'start_reconnect' }
  | { type: 'leave_received_during_reconnect' }
  | { type: 'close' }
  | { type: 'close_completed' };

export type SignalEventType = SignalEvent['type'];

/** A command for the executor. Only `connection_lost` carries data. */
export type SignalEffect =
  | { type: 'open_transport' }
  | { type: 'close_transport' }
  | { type: 'start_ping' }
  | { type: 'stop_ping' }
  | { type: 'clear_queue' }
  | { type: 'connection_lost'; failure: ConnectionFailure }
  | { type: 'reconnect_completed' }
  | { type: 'leave_received' };

export type SignalEffectType = SignalEffect['type'];

export interface TransitionResult {
  /** False if the status does not handle the event. */
  handled: boolean;
  nextStatus: SignalConnectionStatus;
  effects: SignalEffect[];
}

// Only an exit from `connected` reports a failure, so there are two.

/** An abnormal close gives an empty reason. Use this text instead. */
const TRANSPORT_ERROR_FALLBACK = 'Unexpected WS error';

const transportError = (reason: string): ConnectionFailure => ({
  reason: 'transport_error',
  message: reason || TRANSPORT_ERROR_FALLBACK,
  retryable: true,
  supportsRegionFailover: false,
});

const PING_TIMEOUT: ConnectionFailure = {
  reason: 'ping_timeout',
  message: 'ping timeout',
  retryable: true,
  supportsRegionFailover: false,
};

// Each edge gives a target and its effects. `effects` is a function of the event
// only if an effect reads the event. A missing entry means the machine ignores
// the event. Effects of a status, not of one edge, are in ON_EXIT and ON_ENTRY.

type Effects<E extends SignalEventType> =
  SignalEffect[] | ((event: Extract<SignalEvent, { type: E }>) => SignalEffect[]);

type Edge<E extends SignalEventType> = { target: SignalConnectionStatus; effects?: Effects<E> };

type Table = {
  [Status in SignalConnectionStatus]: { [E in SignalEventType]?: Edge<E> };
};

const TABLE: Table = {
  [S.NEW]: {
    connect: { target: S.CONNECTING, effects: [{ type: 'open_transport' }] },
  },

  // No edge reports connection_lost: nothing was established, so the attempt
  // reports the outcome to its caller.
  [S.CONNECTING]: {
    established: { target: S.CONNECTED, effects: [{ type: 'start_ping' }] },
    attempt_failed: { target: S.CLOSED },
    attempt_timed_out: { target: S.CLOSED },
    transport_closed: { target: S.CLOSED },
    // Stop an attempt in progress.
    close: { target: S.CLOSED, effects: [{ type: 'close_transport' }] },
  },

  // stop_ping is an exit effect of `connected`. No edge below repeats it.
  [S.CONNECTED]: {
    transport_closed: {
      target: S.SUSPENDED,
      effects: (event) => [{ type: 'connection_lost', failure: transportError(event.reason) }],
    },
    ping_timeout: {
      target: S.SUSPENDED,
      effects: [{ type: 'connection_lost', failure: PING_TIMEOUT }],
    },
    start_reconnect: { target: S.RECONNECTING, effects: [{ type: 'open_transport' }] },
    close: { target: S.DISCONNECTING, effects: [{ type: 'close_transport' }] },
  },

  [S.SUSPENDED]: {
    start_reconnect: { target: S.RECONNECTING, effects: [{ type: 'open_transport' }] },
    // The transport is already gone. The entry to `closed` clears the buffer.
    close: { target: S.CLOSED },
  },

  [S.RECONNECTING]: {
    established: {
      target: S.CONNECTED,
      effects: [{ type: 'reconnect_completed' }, { type: 'start_ping' }],
    },
    // Go to `suspended` so the orchestrator can try again. The caller already
    // knows about the first loss, so there is no new report.
    attempt_failed: { target: S.SUSPENDED },
    attempt_timed_out: { target: S.SUSPENDED },
    leave_received_during_reconnect: {
      target: S.CLOSED,
      effects: [{ type: 'leave_received' }],
    },
    close: { target: S.CLOSED, effects: [{ type: 'close_transport' }] },
  },

  [S.DISCONNECTING]: {
    close_completed: { target: S.CLOSED },
    // The transport stopped before the close handshake finished. Do not wait.
    transport_closed: { target: S.CLOSED },
  },

  [S.CLOSED]: {},
};

/** Effects for an exit from a status. They apply to all edges out of it. */
const ON_EXIT: Partial<Record<SignalConnectionStatus, SignalEffect[]>> = {
  // Every exit from `connected` stops the ping. A new edge cannot forget it.
  [S.CONNECTED]: [{ type: 'stop_ping' }],
};

/** Effects for an entry to a status. They apply to all edges into it. */
const ON_ENTRY: Partial<Record<SignalConnectionStatus, SignalEffect[]>> = {
  // The entry to the terminal status clears the executor's buffer.
  [S.CLOSED]: [{ type: 'clear_queue' }],
};

/**
 * The effect order is exit, edge, entry, as in SCXML. Exit and entry effects
 * occur only if the status changes.
 */
export function transition(status: SignalConnectionStatus, event: SignalEvent): TransitionResult {
  // The lookup by event type loses the narrow variant the edge was declared for.
  const edge = TABLE[status][event.type] as Edge<SignalEventType> | undefined;
  if (!edge) {
    return { handled: false, nextStatus: status, effects: [] };
  }
  const { target } = edge;
  const changed = target !== status;
  const own =
    typeof edge.effects === 'function'
      ? (edge.effects as (event: SignalEvent) => SignalEffect[])(event)
      : (edge.effects ?? []);
  return {
    handled: true,
    nextStatus: target,
    effects: [
      ...(changed ? (ON_EXIT[status] ?? []) : []),
      ...own,
      ...(changed ? (ON_ENTRY[target] ?? []) : []),
    ],
  };
}

// Message routing never changes the status. See signal-connection.routing.md.

/** The caller selects the kind from the message type, not from the status. */
export type MessageKind = 'passthrough' | 'queueable';

/**
 * `dispatch` sends now. `buffer` appends for a later drain, in order. `drop`
 * discards, because a passthrough message has no value later. `reject` means the
 * status cannot serve the message.
 */
export type MessageRoute = 'dispatch' | 'buffer' | 'drop' | 'reject';

const ROUTES: Record<SignalConnectionStatus, Record<MessageKind, MessageRoute>> = {
  [S.NEW]: { passthrough: 'drop', queueable: 'reject' },
  [S.CONNECTING]: { passthrough: 'dispatch', queueable: 'reject' },
  [S.CONNECTED]: { passthrough: 'dispatch', queueable: 'dispatch' },
  [S.SUSPENDED]: { passthrough: 'drop', queueable: 'buffer' },
  [S.RECONNECTING]: { passthrough: 'dispatch', queueable: 'buffer' },
  [S.DISCONNECTING]: { passthrough: 'drop', queueable: 'reject' },
  [S.CLOSED]: { passthrough: 'drop', queueable: 'reject' },
};

export function routeMessage(
  status: SignalConnectionStatus,
  kind: MessageKind,
  bufferEmpty: boolean,
): MessageRoute {
  const route = ROUTES[status][kind];
  // A queueable message must not pass buffered messages: that breaks the order.
  if (route === 'dispatch' && kind === 'queueable' && !bufferEmpty) {
    return 'buffer';
  }
  return route;
}

const SIGNAL_STATUSES = Object.values(SignalConnectionStatus);

/** The events that cause a transition in the given status. */
export function handledEvents(status: SignalConnectionStatus): SignalEventType[] {
  return Object.keys(TABLE[status]) as SignalEventType[];
}

/** All edges of the table, for tests and diagrams. */
export function signalEdges(): Array<{
  from: SignalConnectionStatus;
  to: SignalConnectionStatus;
  event: SignalEventType;
}> {
  const edges: Array<{
    from: SignalConnectionStatus;
    to: SignalConnectionStatus;
    event: SignalEventType;
  }> = [];
  for (const from of SIGNAL_STATUSES) {
    for (const event of handledEvents(from)) {
      edges.push({ from, to: (TABLE[from][event] as Edge<SignalEventType>).target, event });
    }
  }
  return edges;
}
