---
'livekit-client': patch
---

Remote participants that left while the signal connection was down are now removed when the server marks the participant update it sends after a resume as a full snapshot (`ParticipantUpdate.full_snapshot`). Before, a disconnect update lost during the gap left the participant in `room.remoteParticipants` until the next full reconnect.
