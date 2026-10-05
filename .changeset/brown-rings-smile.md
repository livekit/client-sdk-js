---
'livekit-client': patch
---

Seed the E2EE sender cryptor with the publish codec for h264 and h265. When a non-slice NALU comes before the slice, read an h264 frame as h264. If NALU processing falls back to VP8 handling, log the first bytes of the frame.
