---
'livekit-client': patch
---

Participant actions: the `lk.actions` attribute now carries only `{ name, summary? }` per action, and full entries are fetched on demand with `LocalParticipant.describeActions()` over the `lk.actions.describe` RPC.
