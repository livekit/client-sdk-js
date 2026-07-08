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

export type SignalEventType =
  | 'connect'
  | 'connection_established'
  | 'connection_failed'
  | 'connection_timed_out'
  | 'transport_closed'
  | 'ping_timeout'
  | 'start_reconnect'
  | 'reconnect_established'
  | 'reconnect_attempt_failed'
  | 'reconnect_timed_out'
  | 'leave_received_during_reconnect'
  | 'close'
  | 'close_completed';

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

export interface SignalEvent {
  type: SignalEventType;
  url?: string;
  pingConfig?: PingConfig;
  failure?: ConnectionFailure;
  reason?: string;
  leaveAction?: number;
}

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
// ---------------------------------------------------------------------------
const CONNECTION_TIMEOUT: ConnectionFailure = {
  reason: 'connection_timeout',
  message: 'Connection timed out',
  retryable: true,
  supportsRegionFailover: true,
};

const PING_TIMEOUT: ConnectionFailure = {
  reason: 'ping_timeout',
  message: 'Ping timeout',
  retryable: true,
  supportsRegionFailover: false,
};

const transportError = (message?: string): ConnectionFailure => ({
  reason: 'transport_error',
  message,
  retryable: true,
  supportsRegionFailover: false,
});

// ---------------------------------------------------------------------------
// Effect builders — keep the transition table flat and readable.
// ---------------------------------------------------------------------------
const openTransport = (url?: string): SignalEffect => ({
  type: 'open_transport',
  params: { url, reconnect: false },
});
// On reconnect the executor reuses the endpoint from connect time, so no url.
const reconnectTransport = (): SignalEffect => ({
  type: 'open_transport',
  params: { reconnect: true },
});
const startPing = (config?: PingConfig): SignalEffect => ({
  type: 'start_ping',
  params: { config },
});
const stopPing = (): SignalEffect => ({ type: 'stop_ping' });
const connectionLost = (failure?: ConnectionFailure): SignalEffect => ({
  type: 'connection_lost',
  params: { failure },
});
const closeTransport = (): SignalEffect => ({ type: 'close_transport' });
const reconnectCompleted = (): SignalEffect => ({ type: 'reconnect_completed' });
const leaveReceived = (leaveAction?: number): SignalEffect => ({
  type: 'leave_received',
  params: { leaveAction },
});
const clearQueue = (): SignalEffect => ({ type: 'clear_queue' });

// ---------------------------------------------------------------------------
// Transition table.
//
// Each entry is `{ target, effects }`. `effects` is a plain array, or a
// function of the event when an effect needs the event's payload. A missing
// entry means the event is unhandled in that status (silently ignored).
// ---------------------------------------------------------------------------
interface Transition {
  target: SignalConnectionStatus;
  effects: SignalEffect[] | ((event: SignalEvent) => SignalEffect[]);
}

const TABLE: Record<SignalConnectionStatus, Partial<Record<SignalEventType, Transition>>> = {
  [S.NEW]: {
    connect: { target: S.CONNECTING, effects: (e) => [openTransport(e.url)] },
  },

  [S.CONNECTING]: {
    connection_established: { target: S.CONNECTED, effects: (e) => [startPing(e.pingConfig)] },
    connection_failed: { target: S.CLOSED, effects: (e) => [connectionLost(e.failure)] },
    connection_timed_out: { target: S.CLOSED, effects: [connectionLost(CONNECTION_TIMEOUT)] },
    // transport dropped before the connection was established
    transport_closed: {
      target: S.CLOSED,
      effects: (e) => [connectionLost(transportError(e.reason))],
    },
    // abort an in-flight connection attempt
    close: { target: S.CLOSED, effects: [closeTransport()] },
  },

  [S.CONNECTED]: {
    transport_closed: {
      target: S.SUSPENDED,
      effects: (e) => [stopPing(), connectionLost(transportError(e.reason))],
    },
    ping_timeout: { target: S.SUSPENDED, effects: [stopPing(), connectionLost(PING_TIMEOUT)] },
    start_reconnect: { target: S.RECONNECTING, effects: [stopPing(), reconnectTransport()] },
    close: { target: S.DISCONNECTING, effects: [stopPing(), closeTransport()] },
  },

  [S.SUSPENDED]: {
    start_reconnect: { target: S.RECONNECTING, effects: [reconnectTransport()] },
    // transport already lost; nothing to close. onEntry(closed) flushes buffer.
    close: { target: S.CLOSED, effects: [] },
  },

  [S.RECONNECTING]: {
    reconnect_established: {
      target: S.CONNECTED,
      effects: (e) => [reconnectCompleted(), startPing(e.pingConfig)],
    },
    reconnect_attempt_failed: { target: S.SUSPENDED, effects: (e) => [connectionLost(e.failure)] },
    reconnect_timed_out: { target: S.SUSPENDED, effects: [connectionLost(CONNECTION_TIMEOUT)] },
    leave_received_during_reconnect: {
      target: S.CLOSED,
      effects: (e) => [connectionLost(e.failure), leaveReceived(e.leaveAction)],
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

/** Effects emitted on entry to a status, regardless of which event caused it. */
const ON_ENTRY: Partial<Record<SignalConnectionStatus, SignalEffect[]>> = {
  // Entering the terminal status flushes the executor's message buffer.
  [S.CLOSED]: [clearQueue()],
};

/** Pure transition function. Never mutates. */
export function transition(status: SignalConnectionStatus, event: SignalEvent): TransitionResult {
  const entry = TABLE[status][event.type];
  if (!entry) {
    return { handled: false, nextStatus: status, effects: [] };
  }
  const { target } = entry;
  const effects = typeof entry.effects === 'function' ? entry.effects(event) : entry.effects;
  const onEntry = target !== status ? (ON_ENTRY[target] ?? []) : [];
  return { handled: true, nextStatus: target, effects: [...effects, ...onEntry] };
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
      result.push({ from, to: transition(from, { type: event }).nextStatus, event });
    }
  }
  return result;
}
