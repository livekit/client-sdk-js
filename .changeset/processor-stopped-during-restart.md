---
'livekit-client': patch
---

The server can unpublish a track, and so stop it, while its processor restarts. In that case, `restartTrack()` now rejects with a `TrackInvalidError` that says the track was stopped. It rejected with `TypeError: Cannot read properties of undefined (reading 'processedTrack')` before. `LocalAudioTrack.setProcessor()` rejects in the same way, and `setAudioContext()` returns without an error.
