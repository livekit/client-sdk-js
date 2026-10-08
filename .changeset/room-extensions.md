---
'livekit-client': minor
---

Split `Room` into `CoreRoom` plus extensions. `Room` from the main entry is `CoreRoom.with(...)` with every extension installed and keeps its API. `CoreRoom.with(...)` builds a room class with only the extensions an application needs. `Room.dispose()` releases a room for good. Video publishing (camera, screen share, simulcast, SVC, backup codecs) is the `video` extension; receiving video stays in core. The new `livekit-client/core` entry (ESM only, experimental) exports `CoreRoom` and the extensions.
