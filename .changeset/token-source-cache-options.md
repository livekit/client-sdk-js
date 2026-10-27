---
'livekit-client': patch
---

Fix `TokenSource` caching: a failed fetch no longer leaves the previous response cached under the new options, and `participantAttributes` is compared by content
