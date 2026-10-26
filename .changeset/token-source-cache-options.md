---
'livekit-client': patch
---

Fix `TokenSource` caching: a failed fetch no longer leaves the previous response cached under the new options, `participantAttributes` is compared by content, and options changed in place after a fetch are detected
