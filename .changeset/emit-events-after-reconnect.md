---
'livekit-client': patch
---

Room events emitted right after a reconnect are no longer held back. The room went back to `Connected` and emitted `Reconnected` while the engine still reported a pending reconnect until its attempt settled, so events such as `RoomMetadataChanged` or `ActiveSpeakersChanged` sent in that window were buffered and never emitted.
