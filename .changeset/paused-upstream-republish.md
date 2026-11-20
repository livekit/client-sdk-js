---
'livekit-client': patch
---

A track whose upstream is paused stays paused when it is republished, e.g. after a full reconnect: the new sender starts without the track and the server is told the track is muted.
