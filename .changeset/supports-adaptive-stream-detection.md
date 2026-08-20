---
'livekit-client': patch
---

Fix `supportsAdaptiveStream` always returning `true` by comparing `typeof` against the `'undefined'` string. It now returns `false` in environments without `ResizeObserver` or `IntersectionObserver`.
