---
'livekit-client': minor
---

Create the publisher data channels as negotiated (fixed IDs) in single peer connection mode when the server supports it (protocol 18), saving the data channel open round trip. Falls back to in-band channels against older servers.
