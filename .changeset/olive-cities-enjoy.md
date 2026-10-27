---
'livekit-client': patch
---

Fixes an issue where if a data stream runs into a terminal error, any packets delivered afterwards will be treated as if the stream doesn't exist (and not throw a sync error)
