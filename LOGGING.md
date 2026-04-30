# Logging conventions

This SDK uses [loglevel](https://github.com/pimterry/loglevel) via a thin
wrapper in [`src/logger.ts`](src/logger.ts). Each subsystem gets its own
named logger (see `LoggerNames`) so users can raise verbosity per area via
`setLogLevel(level, loggerName)`.

## Level rubric

- **error** — failure surfaced to the user / unrecoverable. Gave up
  reconnecting, publish rejected by server, decode permanently failed.
- **warn** — recoverable anomaly or automatic retry. ICE restart, signal
  reconnect starting, token refresh retryable failure, unexpected-but-
  handled server message.
- **info** — exactly one log per meaningful lifecycle transition:
  `connecting` / `connected` / `reconnecting (attempt N)` / `reconnected` /
  `disconnected (reason)`, track `published` / `unpublished` /
  `subscribed` / `unsubscribed`, permission changes, region switched,
  e2ee enabled/disabled, signal (re)connected, major engine state
  transitions. Nothing that can fire more than about once per second
  under normal use.
- **debug** — everything else: individual signal messages, per-ICE-
  candidate, SDP, DTX/simulcast/codec negotiation, data channel
  lifecycle, reconnection internal states, timing details.
- **trace** — reserved for deliberate deep dives; unused by default.

## Structured context

Each class passes a structured `logContext` object to every log call so
consumers wired up via `setLogExtension` receive full metadata for
ingestion.

### Binding context to a logger

Prefer creating the named logger with a context provider once, then
passing only call-site-specific extras:

```ts
// in a class constructor
this.log = getLogger(LoggerNames.Engine, () => this.logContext);

// at call sites
this.log.debug('got ICE candidate from peer', { candidate, target });
// devtools: got ICE candidate from peer, { room: 'foo', participant: 'alice', ..., candidate, target }
// setLogExtension: { room: 'foo', participant: 'alice', ..., candidate, target }
```

The context provider is invoked on every call, so updates to `logContext`
are reflected automatically.


