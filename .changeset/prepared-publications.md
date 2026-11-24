---
'livekit-client': patch
---

`setMicrophoneEnabled()` announces the microphone publication (muted) while the device is still being captured, so the published track attaches without another publication negotiation and unmutes when media starts.

`publishTrack()` called before `connect()` sends microphone and camera tracks with the join request, so they are published as soon as the room connects.

Install preconnect-buffer listeners before emitting LocalTrackPublished so synchronous subscription notifications are handled and listeners are cleaned up for ordinary and prepared publications.
