---
'livekit-client': patch
---

`isBrowserSupported()` now also requires `WeakRef` and `Object.hasOwn`. The SDK's state machines (via `machina`) call both unguarded on join, so browsers without them, such as Safari before 15.4, passed the WebRTC check and then failed with a `ReferenceError` or `TypeError` instead of the "update your browser" error from `room.connect()`.
