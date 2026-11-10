---
'livekit-client': patch
---

Stop a disconnected `SignalClient` from logging a spurious "ping timeout triggered" warning 15 s after `room.disconnect()`.
