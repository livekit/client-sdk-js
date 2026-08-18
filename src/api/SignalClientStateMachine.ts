import { type HandlerArgs, type HandlerFn, createFsm } from 'machina';

/**
 * Runtime lifecycle states of the signal connection.
 *
 * `offline` is the resting state after the transport was lost without an explicit close: no
 * attempt is in flight, but a resume is still legal. It is what makes retrying a failed resume
 * expressible — `closed` is only reached by an explicit close or by a terminal attempt failure.
 */
export type SignalLifecycleState =
  'new' | 'connecting' | 'connected' | 'offline' | 'reconnecting' | 'disconnecting' | 'closed';

export interface SignalMachineContext {
  /** Monotonic id of the current (re)connection attempt and of the transport it owns */
  attemptId: number;
  /** Error or reason that ended the last attempt, kept for diagnostics. */
  lastError?: unknown;
  /** Reason passed to the last close request. */
  closeReason?: string;
}

export type SignalMachineInput =
  /** Start an initial session, or restart from scratch (full reconnect). Legal in every state. */
  | { type: 'connect' }
  /** Resume the existing session. Legal in every state. */
  | { type: 'reconnect' }
  | { type: 'connectComplete' }
  | { type: 'connectFailed'; error?: unknown }
  | { type: 'reconnectComplete' }
  /**
   * A resume attempt ended. `recoverable` distinguishes "another resume may follow" (→ `offline`)
   * from a terminal outcome such as a server leave or an expired token (→ `closed`).
   */
  | { type: 'reconnectFailed'; error?: unknown; recoverable: boolean }
  /** The transport identified by `attemptId` was lost (unexpected ws close, ping timeout). */
  | { type: 'transportFailed'; attemptId: number; reason: string }
  | { type: 'close'; reason: string }
  | { type: 'closeComplete' };

type Args = HandlerArgs<SignalMachineContext, SignalLifecycleState>;

type Handler = HandlerFn<SignalMachineContext, SignalLifecycleState>;

/**
 * Declares a handler for one input, restoring the payload typing that machina's `...unknown[]`
 * handler arguments give up.
 */
function on<T extends SignalMachineInput['type']>(
  handler: (
    args: Args,
    event: Extract<SignalMachineInput, { type: T }>,
  ) => SignalLifecycleState | void,
): Handler {
  return handler as Handler;
}

const startConnect = on<'connect'>(({ ctx }) => {
  ctx.attemptId += 1;
  ctx.lastError = undefined;
  return 'connecting';
});

const startReconnect = on<'reconnect'>(({ ctx }) => {
  ctx.attemptId += 1;
  ctx.lastError = undefined;
  return 'reconnecting';
});

const requestClose = on<'close'>(({ ctx }, event) => {
  ctx.closeReason = event.reason;
  return 'disconnecting';
});

const signalStates = {
  new: {
    connect: startConnect,
    reconnect: startReconnect,
    close: requestClose,
  },
  connecting: {
    connect: startConnect,
    reconnect: startReconnect,
    connectComplete: 'connected',
    // An initial connect has no session to fall back on, so failure is terminal.
    connectFailed: on<'connectFailed'>(({ ctx }, event) => {
      ctx.lastError = event.error;
      return 'closed';
    }),
    close: requestClose,
  },
  connected: {
    connect: startConnect,
    reconnect: startReconnect,
    transportFailed: on<'transportFailed'>(({ ctx }, event) => {
      if (event.attemptId !== ctx.attemptId) {
        // a transport that has already been replaced, reporting its close late
        return;
      }
      ctx.lastError = event.reason;
      return 'offline';
    }),
    close: requestClose,
  },
  offline: {
    connect: startConnect,
    reconnect: startReconnect,
    close: requestClose,
  },
  reconnecting: {
    connect: startConnect,
    reconnect: startReconnect,
    reconnectComplete: 'connected',
    reconnectFailed: on<'reconnectFailed'>(({ ctx }, event) => {
      ctx.lastError = event.error;
      return event.recoverable ? 'offline' : 'closed';
    }),
    close: requestClose,
  },
  // Owns the transport until the close handshake settles. Every path into this state is followed
  // by a `closeComplete`, so it cannot become a trap.
  disconnecting: {
    connect: startConnect,
    reconnect: startReconnect,
    closeComplete: 'closed',
  },
  closed: {
    connect: startConnect,
    reconnect: startReconnect,
  },
} as const;

/**
 * Lifecycle model of the signal connection.
 *
 * The machine deliberately does not own connection attempts: `SignalClient` performs the
 * asynchronous work and reports the outcome. It also does not decide *whether* to reconnect —
 * that policy (backoff, resume vs. full reconnect, region failover, giving up) belongs to
 * `RTCEngine`, so transport loss lands in `offline` rather than starting a reconnect on its own.
 *
 * Each client gets its own instance: the context is mutable and per-connection.
 */
export function createSignalMachine() {
  const context: SignalMachineContext = { attemptId: 0 };
  return createFsm({
    id: 'signal',
    initialState: 'new',
    context,
    states: signalStates,
  });
}

export type SignalMachine = ReturnType<typeof createSignalMachine>;

/** All lifecycle states, derived from the machine itself so the two cannot drift. */
export const signalLifecycleStates = Object.keys(signalStates) as Array<SignalLifecycleState>;
