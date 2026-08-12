---
'livekit-client': patch
---

Apply the resolved degradation preference to the backup codec's sender

Degradation preference is a property of the sender, not of the track, and a backup codec publishes over its own sender. Previously only the primary sender was configured, so the backup encoder resolved a preference implicitly and could adapt along a different axis than the primary.
