---
'livekit-client': patch
---

Add jitter to the first reconnect retry and scale it with the delay on later retries in the default reconnect policy, so clients that disconnect together do not reconnect at the same time. The second and third retries now wait about 3 and 5 seconds instead of 0.3 and 1.2 seconds.
