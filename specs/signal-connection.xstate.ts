// Signal Connection — lifecycle FSM (XState mirror of signal-connection.scxml).
//
// Pure lifecycle machine: no context/extended state. Every transition is a
// function of (state, event) only. Effects (open_transport, start_ping, ...)
// are documented in the SCXML spec and performed by the executor; they are
// not modeled here. Message routing and buffering are NOT part of this
// machine — see signal-connection.routing.md and signal-connection.buffer.md.

import { setup } from 'xstate';

interface ConnectionFailure {
  reason: string;
  message?: string;
  retryable: boolean;
  supportsRegionFailover: boolean;
}

interface PingConfig {
  intervalS: number;
  timeoutS: number;
}

// Event payloads are the executor's contract (used to build effects); the
// machine itself stores none of them.
type SignalEvents =
  | { type: 'connect'; url: string }
  | { type: 'connection_established'; pingConfig: PingConfig }
  | { type: 'connection_failed'; failure: ConnectionFailure }
  | { type: 'connection_timed_out' }
  | { type: 'transport_closed'; reason: string }
  | { type: 'ping_timeout' }
  | { type: 'start_reconnect' }
  | { type: 'reconnect_established'; pingConfig: PingConfig }
  | { type: 'reconnect_attempt_failed'; failure: ConnectionFailure }
  | { type: 'reconnect_timed_out' }
  | { type: 'leave_received_during_reconnect'; failure: ConnectionFailure; leaveAction: number }
  | { type: 'close' }
  | { type: 'close_completed' };

export const signalConnectionMachine = setup({
  types: {
    events: {} as SignalEvents,
  },
}).createMachine({
  id: 'SignalConnection',
  initial: 'new',
  states: {
    new: {
      on: {
        connect: 'connecting',
      },
    },

    connecting: {
      on: {
        connection_established: 'connected',
        connection_failed: 'closed',
        connection_timed_out: 'closed',
        // transport dropped before the connection was established
        transport_closed: 'closed',
        // abort an in-flight connection attempt
        close: 'closed',
      },
    },

    connected: {
      on: {
        transport_closed: 'suspended',
        ping_timeout: 'suspended',
        start_reconnect: 'reconnecting',
        close: 'disconnecting',
      },
    },

    suspended: {
      description: 'Transport lost. Executor buffers queueable messages. Orchestrator decides next step.',
      on: {
        start_reconnect: 'reconnecting',
        close: 'closed',
      },
    },

    reconnecting: {
      on: {
        reconnect_established: 'connected',
        reconnect_attempt_failed: 'suspended',
        reconnect_timed_out: 'suspended',
        leave_received_during_reconnect: 'closed',
        // abort a reconnect in progress
        close: 'closed',
      },
    },

    disconnecting: {
      on: {
        close_completed: 'closed',
        // transport dropped instead of closing cleanly — don't hang
        transport_closed: 'closed',
      },
    },

    closed: {
      type: 'final',
    },
  },
});
