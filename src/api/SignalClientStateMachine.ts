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
  /**
   * Start an initial session, or restart from scratch (full reconnect).
   *
   * Establishing is legal exactly where no transport and no attempt are in play: `new`, `offline`
   * and `closed`. `closed` is included because it means "no transport", not "session over" — a
   * deliberate close and an unexpected loss leave the session equally resumable, and the engine
   * recovers from both. Establishing over a live session, or over an attempt already in flight, is
   * a caller error; `disconnecting` is waited out rather than refused.
   */
  | { type: 'connect' }
  /**
   * Resume the existing session: legal wherever establishing is, minus `new` (nothing to resume
   * yet), plus `connected` — the peer connection can be severed while signalling stays up.
   */
  | { type: 'reconnect' }
  /**
   * An attempt established its transport. Carries the attempt it belongs to: an attempt that a
   * newer one has already superseded must not declare the session live.
   */
  | { type: 'connectComplete'; attemptId: number }
  | { type: 'connectFailed'; error?: unknown }
  | { type: 'reconnectComplete'; attemptId: number }
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

/**
 * Whether a transport-originated input belongs to the attempt that currently owns the session.
 * Inputs from a superseded attempt are dropped: its transport is already being replaced, so it can
 * neither declare the session live nor take it down.
 */
function isCurrentAttempt(ctx: SignalMachineContext, event: { attemptId: number }) {
  return event.attemptId === ctx.attemptId;
}

const attemptEstablished = on<'connectComplete' | 'reconnectComplete'>(({ ctx }, event) => {
  if (!isCurrentAttempt(ctx, event)) {
    return;
  }
  return 'connected';
});

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
    close: requestClose,
  },
  connecting: {
    connectComplete: attemptEstablished,
    // An initial connect has no session to fall back on, so failure is terminal.
    connectFailed: on<'connectFailed'>(({ ctx }, event) => {
      ctx.lastError = event.error;
      return 'closed';
    }),
    close: requestClose,
  },
  connected: {
    reconnect: startReconnect,
    transportFailed: on<'transportFailed'>(({ ctx }, event) => {
      if (!isCurrentAttempt(ctx, event)) {
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
    reconnectComplete: attemptEstablished,
    reconnectFailed: on<'reconnectFailed'>(({ ctx }, event) => {
      ctx.lastError = event.error;
      return event.recoverable ? 'offline' : 'closed';
    }),
    close: requestClose,
  },
  // Owns the transport until the close handshake settles. Every path into this state is followed
  // by a `closeComplete`, so it cannot become a trap.
  disconnecting: {
    closeComplete: 'closed',
  },
  // No transport, but the session may still be resumable: the engine resumes after an unexpected
  // close just as it does from `offline`.
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
export function createSignalMachine(initialState: SignalLifecycleState = 'new') {
  const context: SignalMachineContext = { attemptId: 0 };
  return createFsm({
    id: 'signal',
    initialState: initialState,
    context,
    states: signalStates,
  });
}

export type SignalMachine = ReturnType<typeof createSignalMachine>;

/** All lifecycle states, derived from the machine itself so the two cannot drift. */
export const signalLifecycleStates = Object.keys(signalStates) as Array<SignalLifecycleState>;
