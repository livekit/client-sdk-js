---
'livekit-client': patch
---

Stop `restartTrack()` from rejecting with a `TypeError` when the track is unpublished while its processor restarts.
