---
'livekit-client': patch
---

When an SEI or AUD NALU precedes the slice, encrypt h264 frames from the correct offset. Those NALUs read as h265 slice types, so detection returned h265 and the unencrypted prefix ended inside the leading NALU. The slice header was encrypted and no error was raised. The frame bytes now take precedence over a caller-supplied codec. The sender cryptor is also seeded with the publish codec for h264 and h265. A fallback to VP8 handling now logs the first bytes of the frame.
