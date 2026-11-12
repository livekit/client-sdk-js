---
'livekit-client': patch
---

`performRpc` now rejects with the new `CONNECTION_CLOSED` (1506) error when the local participant disconnects from the room. Previously a pending call stayed pending until its `responseTimeout`, then rejected with `RESPONSE_TIMEOUT`.
