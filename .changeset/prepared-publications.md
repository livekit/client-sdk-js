---
'livekit-client': patch
---

Prepare initial Session publications internally so room connection can proceed alongside device capture and attach eligible tracks without another publication negotiation.

Install preconnect-buffer listeners before emitting LocalTrackPublished so synchronous subscription notifications are handled and listeners are cleaned up for ordinary and prepared publications.
