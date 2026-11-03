---
'livekit-client': patch
---

Incoming data stream chunks and trailers are now only accepted from the participant whose header opened the stream. Previously any participant that knew a stream id (as every recipient of a multi-destination stream does) could append content to another participant's stream, merge attributes into it, or end it. A packet from the wrong sender is dropped on its own; the stream continues.
