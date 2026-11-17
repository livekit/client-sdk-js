---
'livekit-client': patch
---

Keep the last transceiver of the publisher connection when you unpublish its track. A stop of the only transceiver made the browser drop the transport of the connection, and the next publish sent no media.
