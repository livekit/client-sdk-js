---
'livekit-client': patch
---

Cancel an incoming data stream when its reader stops early (an aborted `signal`, a `break` out of `for await`, or a read error), so the stream is unregistered and later packets for it are dropped instead of buffering until the trailer arrives. A reader can no longer resume a stream after leaving its iteration early.
