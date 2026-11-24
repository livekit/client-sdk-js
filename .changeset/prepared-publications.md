---
'livekit-client': patch
---

When `setMicrophoneEnabled()` is called before or alongside `connect()`, reserve the microphone publication so it is registered while the device is still being captured and attaches without another publication negotiation.

Install preconnect-buffer listeners before emitting LocalTrackPublished so synchronous subscription notifications are handled and listeners are cleaned up for ordinary and prepared publications.
