---
'livekit-client': patch
---

Seed the E2EE sender cryptor with the publish codec for h264 and h265. If NALU processing falls back to VP8 handling, log the first bytes of the frame.
