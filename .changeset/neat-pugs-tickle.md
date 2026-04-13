---
'livekit-client': patch
---

Avoid hard dependency on global `DOMException` so React Native Hermes environments can initialize `livekit-client` without a manual polyfill.
