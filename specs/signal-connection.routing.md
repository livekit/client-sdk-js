# Signal Connection — Message Routing Policy

Companion to `signal-connection.scxml`. The lifecycle FSM does **not** handle
messages. Whether a message is dispatched, buffered, or refused is a pure
projection of the FSM's current state, evaluated by the executor via the
`route` function below. Routing never changes the lifecycle state.

## Message kinds

The **caller** picks the kind based on the message type, not the connection state:

- **passthrough** — must never be buffered (e.g. leave requests, trickle ICE
  candidates). Sent now or dropped; ordering across reconnects is not promised.
- **queueable** — everything else. Sent now when possible, otherwise buffered
  (see `signal-connection.buffer.md`) and flushed later, in order.

## The policy

`route(state, message, kind) -> dispatch | buffer | drop | reject`

| state           | passthrough | queueable            |
| --------------- | ----------- | -------------------- |
| `new`           | drop        | reject               |
| `connecting`    | dispatch    | reject               |
| `connected`     | dispatch    | dispatch \| buffer\* |
| `suspended`     | drop        | buffer               |
| `reconnecting`  | dispatch    | buffer               |
| `disconnecting` | drop        | reject               |
| `closed`        | drop        | reject               |

\* **`connected` queueable is buffer-aware.** Dispatch immediately **only when
the buffer is empty**. If the buffer is non-empty (i.e. reconnect just
completed and the drain has not yet run), *append* instead — otherwise the new
message overtakes older buffered ones and FIFO ordering breaks. See the buffer
contract's drain semantics. This is the fix for the reconnect reorder hazard.

## Outcome semantics

- **dispatch** — hand the message to the open transport now.
- **buffer** — append to the executor-owned buffer (`buffer.md`).
- **drop** — silently discard. Correct for passthrough with no live transport:
  a leave/trickle message that cannot be sent now is never sent.
- **reject** — the message is not accepted. Today this is a silent no-op
  (matches the FSM's "unhandled events are ignored"). Recommendation: surface
  it to the caller as an error rather than dropping silently, since reaching a
  reject means the caller enqueued into a state that structurally cannot serve
  the message.

## Why this isn't in the FSM

Every routing outcome above is a function of `(state, kind)` — a lookup, not a
transition. Encoding it as targetless self-transitions inside the machine
added no lifecycle semantics and was the sole source of the machine's extended
state (the buffer) and its only data-dependent guard. Keeping it here leaves
the FSM a pure Mealy machine and makes rejection an explicit branch instead of
modeling-by-omission.
