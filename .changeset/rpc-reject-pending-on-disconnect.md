---
'livekit-client': patch
---

`performRpc` now rejects with `RECIPIENT_DISCONNECTED` when the local participant disconnects from the room. Previously a pending call stayed pending until its `responseTimeout`, then rejected with `RESPONSE_TIMEOUT`.
