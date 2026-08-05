---
'livekit-client': patch
---

Only run the `TrackEvent.TimeSyncUpdate` animation frame loop while something is subscribed to the event, and clear the frame handle when a track's monitor is stopped so the loop can be restarted
