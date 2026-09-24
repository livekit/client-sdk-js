---
'livekit-client': minor
---

Client telemetry: the SDK can now report its own sessions as OTLP to a collector — `lk.connect` and `lk.reconnect` spans with their checkpoints, `lk.publish` and `lk.subscribe`, `lk.rtc.stats.sample` windows folded from the readings the track monitors already take, `lk.room.disconnected`, and the device state a page can observe. Records are batched write-ahead into a cache and uploaded under a policy that never lets telemetry win over media: one request in flight, holds while connecting, a 429 that keeps its batch, and a per-tick budget for replaying a backlog. Off unless `Telemetry.configure({ endpoint })` is called or the room is on LiveKit Cloud, which derives the route and the token from the connect. See TELEMETRY.md.
