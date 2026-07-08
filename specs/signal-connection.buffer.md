# Signal Connection — Message Buffer Contract

Companion to `signal-connection.scxml` and `signal-connection.routing.md`.

The lifecycle FSM holds no message state. The **executor owns the buffer**.
This document is the contract that buffer implementation must satisfy so that
the routing policy behaves correctly across the connection lifecycle.

## Ownership

- The buffer lives in the executor, not in the FSM. The FSM emits at most one
  buffer-related effect — `clear_queue` on entry to `closed` (see below).
- The executor also owns the connection endpoint (`url`). The FSM emits
  `open_transport(reconnect=true)` with no url on reconnect; the executor
  reuses the endpoint it was given at `connect` time.

## Contents

- Only **queueable** messages that `route` resolved to `buffer` are stored —
  i.e. messages accepted while the connection is `suspended` or `reconnecting`,
  and queueable messages accepted while `connected` with a non-empty buffer.
- Passthrough messages are never buffered.

## Ordering

- **FIFO.** Messages are dispatched in the order they were accepted.
- **Drain preserves global order.** Because `connected` appends (rather than
  dispatches) while the buffer is non-empty, a message accepted after a
  reconnect never overtakes messages buffered during the outage.

## Drain

- Draining is **orchestrator-triggered**, not FSM-driven. There is no
  `drain_queue` event into the machine — the orchestrator calls the buffer
  directly once it decides the connection is ready to serve buffered traffic.
- Drain is meaningful only while `connected`. Timing differs by reconnect type
  (immediate for a resume; deferred until re-publish for a restart) — that
  decision is the orchestrator's, deliberately outside this contract.
- Drain dispatches every buffered message in FIFO order, then empties the
  buffer. Draining an empty buffer is a no-op.

## Clear

- On entry to `closed`, the FSM emits `clear_queue`. The executor **discards**
  all buffered messages without dispatching them.
- This is the single place the buffer is cleared. It covers every terminal
  path: aborted connect, close from suspended, abort during reconnect, leave
  during reconnect, and completed/aborted graceful close.

## Invariant

> When the connection is `closed`, the buffer is empty.

(Moved here from the FSM spec, which no longer owns the buffer. Guaranteed by
the `clear_queue` effect on `closed/onentry`.)

## Open question — bound

The buffer is currently unbounded. A stalled reconnect with a chatty caller
grows it without limit. Consider a cap (drop-oldest or reject-newest) and
`log()` what was dropped. Out of scope for the lifecycle FSM; belongs here.
