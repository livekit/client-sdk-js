---
'livekit-client': patch
---

Return early from `Room.connect()` while reconnecting so a redundant call no longer aborts an in-flight reconnect
