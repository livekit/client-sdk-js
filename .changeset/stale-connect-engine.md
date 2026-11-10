---
'livekit-client': patch
---

If `room.disconnect()` runs during the signal join, the connection attempt now rejects as cancelled instead of with a `TypeError`. A stale connection attempt no longer closes the engine of a newer connection or disconnects the room.
