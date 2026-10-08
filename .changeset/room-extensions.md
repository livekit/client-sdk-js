---
'livekit-client': minor
---

Split `Room` into `CoreRoom` plus extensions. `createRoom(options, [extensions])` from `livekit-client/core` builds a room with only the extensions an application needs; `e2ee`, `frameMetadata` and `dataStreams` take their options directly. `Room.dispose()` releases a room for good. Video publishing (camera, screen share, simulcast, SVC, backup codecs) is the `video` extension; receiving video stays in core. The new `livekit-client/core` entry (ESM only, experimental) exports `CoreRoom` and the extensions. `simulateParticipants` and the legacy chat messages are extensions too; the core entry does not offer legacy chat.
