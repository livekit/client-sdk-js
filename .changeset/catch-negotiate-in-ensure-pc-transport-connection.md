---
'livekit-client': patch
---

Catch the rejection from the publisher's `negotiate()` when ensuring the PC transport connection, so a failed offer no longer surfaces as an unhandled promise rejection
