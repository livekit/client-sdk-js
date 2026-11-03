---
'livekit-client': patch
---

Keep `engine.pendingReconnect` accurate across reconnect attempts. A failed attempt no longer clears the handle of the retry it just scheduled (which made `pendingReconnect` read `false` while a retry was pending), and the flag now clears as soon as the reconnect timer is cleared. Buffered room events are also flushed when the engine finishes restarting if the room already reports connected.
