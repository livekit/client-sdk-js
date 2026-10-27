---
'livekit-client': patch
---

Follow a full reconnect that happens during the initial connection (e.g. after the server moves a client off dead UDP) instead of timing out on the closed transports and tearing down the recovered session. The room stays `Connecting` during a resume or restart inside `connect()` and emits no `SignalReconnecting`, `Reconnecting` or `Reconnected`. Also stop polling the transports after the connection timeout, and reject an already-aborted transport wait as cancelled instead of leaving it pending.
