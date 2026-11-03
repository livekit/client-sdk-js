---
'livekit-client': patch
---

Ignore a late `DISCONNECTED` update for an earlier session of a remote participant, so it no longer removes the participant's current session from `room.remoteParticipants`.
