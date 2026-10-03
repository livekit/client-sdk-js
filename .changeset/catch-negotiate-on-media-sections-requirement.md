---
'livekit-client': patch
---

Catch the rejection from `negotiate()` when the server requests media sections, so a failed renegotiation no longer surfaces as an unhandled promise rejection
