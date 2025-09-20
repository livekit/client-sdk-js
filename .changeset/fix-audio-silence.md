---
"@livekit/client": patch
---

Fixes an issue where the `AudioContext` was closed when checking for silence. The context is now kept open, preventing downstream errors when trying to resume it.