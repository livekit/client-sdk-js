---
'livekit-client': patch
---

Fix arace in setKeyFromMaterial that would cause keys to be set at the wrong index if several keys were set in quick succession.
