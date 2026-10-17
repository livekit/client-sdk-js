---
'livekit-client': patch
---

Fix an unhandled promise rejection when the signal passed to `dataTracks.getDeferred()` aborts, even though the caller catches the rejected promise.
