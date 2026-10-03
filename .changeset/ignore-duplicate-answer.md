---
'livekit-client': patch
---

Ignore a duplicated server answer (same offerId) instead of applying it twice and surfacing a `NegotiationError`.
