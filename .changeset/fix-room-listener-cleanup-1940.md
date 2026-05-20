---
'livekit-client': patch
---

Fix memory leak where the constructor-registered `devicechange` listener on `navigator.mediaDevices` was not removed when a `Room` was constructed but never connected. The listener kept the `Room` instance reachable from the global `navigator.mediaDevices` EventTarget, defeating the `FinalizationRegistry` cleanup.
