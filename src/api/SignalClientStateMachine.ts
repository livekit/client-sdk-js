import { type HandlerArgs, type HandlerFn, createFsm } from 'machina';

/**
 * Runtime lifecycle states of the signal connection.
 *
 * `offline` is the resting state after the transport was lost without an explicit close: no
 * attempt is in flight, but a resume is still legal. It is what makes retrying a failed resume
 * expressible — `closed` is only reached by an explicit close or by a terminal attempt failure.
 *
 * The two recovery paths the SDK distinguishes appear as `resuming` (the session is kept — signal
 * `reconnect`, ICE restart) and `connecting` (a full reconnect, which joins a new session and so
 * looks like an initial connect from here).
 *
 * `signalResumed` is the window a resume spends between the transport coming back and the engine
 * declaring the reconnect complete — the same window the engine spans with its `SignalResumed` and
 * `Resumed` events. The signal connection is usable there (it projects as connected), but requests
 * held during the resume stay held until the peer connection is back too. See `reconnected`.
 */
export type SignalLifecycleState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'offline'
  | 'resuming'
  | 'signalResumed'
  | 'disconnecting'
  | 'closed';

export interface SignalMachineContext {
  /**
   * Monotonic id of the current (re)connection attempt and of the transport it owns. Bumped
   * whenever an attempt starts, so events from a transport that has since been replaced carry a
   * stale id and are ignored instead of tearing down the live connection.
   */
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
  | { type: 'resume' }
  | { type: 'connectComplete' }
  | { type: 'connectFailed'; error?: unknown }
  | { type: 'resumeComplete' }
  /**
   * A resume attempt ended. `recoverable` distinguishes "another resume may follow" (→ `offline`)
   * from a terminal outcome such as a server leave or an expired token (→ `closed`).
   */
  | { type: 'resumeFailed'; error?: unknown; recoverable: boolean }
  /** The transport identified by `attemptId` was lost (unexpected ws close, ping timeout). */
  | { type: 'transportFailed'; attemptId: number; reason: string }
  /**
   * The engine declares the reconnect complete, on either recovery path — it is what
   * `setReconnected()` reports, and it releases any held requests.
   *
   * The engine owns this because only it knows when a resume is really done: signalling stays held
   * until the peer connection is back, which is the behaviour "Queue signalling until ICE
   * reconnected" (#151) introduced. A full reconnect reaches `connected` directly, so there the
   * input arrives with nothing left to declare.
   */
  | { type: 'reconnected' }
  | SendRequestInput
  | { type: 'close'; reason: string }
  | { type: 'closeComplete' };

/**
 * An outbound request offered to the machine, which decides whether it goes out now or is held
 * until the session is live again. The object carries the verdict back out: `write` is the caller's
 * own write, `sent` is set to its promise when the machine let the request through.
 */
export interface SendRequestInput {
  type: 'sendRequest';
  /**
   * Performs the write. `held` is true when the machine had parked this request, and tells the
   * caller to write it in a way that preserves order against requests made since.
   */
  write: (held: boolean) => Promise<void>;
  /** Set by the machine when it parks the request, and seen again when the request is replayed. */
  held?: boolean;
  /** The write promise, when the machine let the request through immediately. */
  sent?: Promise<void>;
}

type Args = HandlerArgs<SignalMachineContext, SignalLifecycleState>;

type Handler = HandlerFn<SignalMachineContext, SignalLifecycleState>;

/**
 * Declares a handler for one input, restoring the payload typing that machina's `...unknown[]`
 * handler arguments give up. Inputs are dispatched as `handle(event.type, event)`, so the whole
 * event object arrives as the single extra argument.
 */
function on<T extends SignalMachineInput['type']>(
  handler: (
    args: Args,
    event: Extract<SignalMachineInput, { type: T }>,
  ) => SignalLifecycleState | void,
): Handler {
  return handler as Handler;
}

// Starting a recovery attempt is legal in every state: `RTCEngine` restarts from `connected`,
// escalates a failed resume from `offline`/`resuming`, and resumes from `connected` when only the
// peer connection was severed. Starting an attempt bumps `attemptId`, which is what invalidates the
// previous attempt's transport events.
const startConnect = on<'connect'>(({ ctx }) => {
  ctx.attemptId += 1;
  ctx.lastError = undefined;
  return 'connecting';
});

const startResume = on<'resume'>(({ ctx }) => {
  ctx.attemptId += 1;
  ctx.lastError = undefined;
  return 'resuming';
});

const requestClose = on<'close'>(({ ctx }, event) => {
  ctx.closeReason = event.reason;
  return 'disconnecting';
});

/** Lets a request through. Also the replay path: machina re-dispatches held requests here. */
const performSend = on<'sendRequest'>((_args, event) => {
  event.sent = event.write(event.held ?? false);
});

/** Parks a request until the engine declares the session live again. */
const holdSend = on<'sendRequest'>(({ defer }, event) => {
  event.held = true;
  defer({ until: 'connected' });
});

/**
 * A full reconnect is already complete on arrival at `connected`, so the engine reporting it is a
 * deliberate no-op rather than an unhandled input.
 */
const alreadyReconnected = on<'reconnected'>(() => {});

const transportLost = on<'transportFailed'>(({ ctx }, event) => {
  if (event.attemptId !== ctx.attemptId) {
    // a transport that has already been replaced, reporting its close late
    return;
  }
  ctx.lastError = event.reason;
  return 'offline';
});

const signalStates = {
  new: {
    connect: startConnect,
    resume: startResume,
    sendRequest: performSend,
    close: requestClose,
  },
  connecting: {
    connect: startConnect,
    resume: startResume,
    connectComplete: 'connected',
    // An initial connect has no session to fall back on, so failure is terminal.
    connectFailed: on<'connectFailed'>(({ ctx }, event) => {
      ctx.lastError = event.error;
      return 'closed';
    }),
    sendRequest: performSend,
    close: requestClose,
  },
  connected: {
    connect: startConnect,
    resume: startResume,
    transportFailed: transportLost,
    reconnected: alreadyReconnected,
    sendRequest: performSend,
    close: requestClose,
  },
  offline: {
    connect: startConnect,
    resume: startResume,
    sendRequest: performSend,
    close: requestClose,
  },
  resuming: {
    connect: startConnect,
    resume: startResume,
    resumeComplete: 'signalResumed',
    resumeFailed: on<'resumeFailed'>(({ ctx }, event) => {
      ctx.lastError = event.error;
      return event.recoverable ? 'offline' : 'closed';
    }),
    // requests made while the transport is down wait for the reconnect to complete
    sendRequest: holdSend,
    close: requestClose,
  },
  signalResumed: {
    connect: startConnect,
    resume: startResume,
    // the engine declaring the reconnect complete is what releases the held requests
    reconnected: 'connected',
    transportFailed: transportLost,
    sendRequest: performSend,
    close: requestClose,
  },
  // Owns the transport until the close handshake settles. Every path into this state is followed
  // by a `closeComplete`, so it cannot become a trap.
  disconnecting: {
    connect: startConnect,
    resume: startResume,
    sendRequest: performSend,
    closeComplete: 'closed',
  },
  closed: {
    connect: startConnect,
    resume: startResume,
    sendRequest: performSend,
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
