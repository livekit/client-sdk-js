---
"livekit-client": patch
---

fix: recover broken publish paths — act on local `ConnectionQuality.Lost`, verify ICE restarts land during resume, add outbound-RTP liveness to the connection reconcile, and reconnect (instead of disconnecting) on a detected state mismatch
