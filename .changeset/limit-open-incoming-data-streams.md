---
'livekit-client': patch
---

Limit each remote participant to 500 concurrently open incoming data streams. Headers for new streams beyond the limit are dropped with an error log, so a participant can no longer exhaust a receiver's memory by opening streams it never closes.
