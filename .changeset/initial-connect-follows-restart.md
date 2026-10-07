---
'livekit-client': patch
---

Follow a full reconnect that happens during the initial connection (e.g. a server leave with action `RECONNECT` moving a client off dead UDP) instead of timing out on the closed transports and tearing down the recovered session.
