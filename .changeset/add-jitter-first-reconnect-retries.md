---
'livekit-client': patch
---

Add jitter to reconnect retries in the default reconnect policy, including the first retry and reconnects requested by the server, so clients that disconnect together don't reconnect at the same time. The first retry waits a random 0 to 500 ms, and later retries scale their existing base delays by a random factor between 0.5 and 1.5.
