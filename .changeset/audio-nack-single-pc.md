---
'livekit-client': patch
---

Negotiate Opus NACK for received audio in single peer connection mode. Offers created by the client, including the initial offer sent with the join, now add `a=rtcp-fb:111 nack` to `recvonly` audio sections, so lost subscribed audio can be retransmitted when RED is not in use (for example with E2EE). Because LiveKit server negotiates audio feedback once per peer connection, this also enables NACK for the client's own non-RED microphone upstream.
