---
'livekit-client': patch
---

The server can unpublish a track, and so stop it, while its processor restarts. In that case, `restartTrack()` now rejects with a `TrackInvalidError` that says the track was stopped. It rejected with `TypeError: Cannot read properties of undefined (reading 'processedTrack')` before. `setAudioContext()` returns without an error.

A track can also stop while `setProcessor()` waits for the processor's `init()`. In that case, `setProcessor()` now destroys the processor and rejects with a `TrackInvalidError`. Before, it set the processor on the stopped track and never destroyed it, and a later restart of the track restarted that processor too.
