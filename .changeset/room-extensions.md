---
'livekit-client': minor
---

Split `Room` into `CoreRoom` plus extensions. `Room` from the main entry is `CoreRoom.with(...)` with every extension installed and keeps its API. `CoreRoom.with(...)` builds a room class with only the extensions an application needs. `Room.dispose()` releases a room for good.
