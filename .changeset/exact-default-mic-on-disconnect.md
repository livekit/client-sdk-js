---
'livekit-client': patch
---

On Chrome, a disconnected microphone now restarts on the OS default input instead of the first enumerated device. If a restart fails after the user stopped the track, the capture device no longer stays live
