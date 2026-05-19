---
'livekit-client': patch
---

Restore Firefox compatibility regressed in 2.18.1 by skipping the prejoin
publisher offer optimization (#1846) on Firefox, where the deferred
setLocalDescription left publisher data channels stuck in `'connecting'`.
Fixes #1919.
