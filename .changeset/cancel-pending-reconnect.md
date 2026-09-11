---
'livekit-client': patch
---

Cancel in-flight full reconnects when the engine closes, preventing delayed cleanup, region failover, or join responses from reopening a disconnected session. Honor cancellation before opening a signal transport.
