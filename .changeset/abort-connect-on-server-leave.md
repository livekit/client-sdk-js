---
'livekit-client': patch
---

If the server disconnects the participant while `room.connect()` is still waiting for the transports (e.g. a `DUPLICATE_IDENTITY` leave), the connection attempt is now cancelled. Previously it kept waiting until `peerConnectionTimeout`, then failed over to another region and rejoined with the same token after the room had already emitted `Disconnected`; `room.disconnect()` could not stop it because the room already looked disconnected.
