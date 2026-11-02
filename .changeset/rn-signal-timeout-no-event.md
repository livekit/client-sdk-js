---
'livekit-client': patch
---

Guard `instanceof Event` in the signal connect abort handler so React Native (no global `Event`) can still time out a hanging signal dial instead of throwing `ReferenceError`.
