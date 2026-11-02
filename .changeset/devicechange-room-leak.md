---
'livekit-client': patch
---

Fix a memory leak where a `Room` was never garbage collected after the application dropped it.
