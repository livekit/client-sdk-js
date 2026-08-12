---
"livekit-client": patch
---

fix: recover broken publish paths — act on local `ConnectionQuality.Lost`, recreate the peer connection when an ICE restart has no remote description, bound how long a transport may stay connecting, and reconnect (instead of disconnecting) on a detected connection state mismatch
