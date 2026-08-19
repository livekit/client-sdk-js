---
'livekit-client': patch
---

Treat TokenSource JWTs without `exp` as expired, and still honor `exp` when `nbf` is absent
