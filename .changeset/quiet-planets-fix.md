---
"livekit-client": patch
---

fix: recover broken publish paths — act on local `ConnectionQuality.Lost`, add outbound-RTP liveness to the connection reconcile, recreate the peer connection when an ICE restart has no remote description, and reconnect (instead of disconnecting) on a detected connection state mismatch
