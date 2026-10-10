---
'livekit-client': minor
---

Add client telemetry: every Room on LiveKit Cloud reports its connect, reconnect, publish and subscribe spans, RTC statistics windows, SDK warnings and device state to its own project when the token carries the observability grant; `disableTelemetry()` opts the process out, `Room.emitTelemetryEvent()` and `Room.setTelemetryAttribute()` add the app's own events and correlation ids.
