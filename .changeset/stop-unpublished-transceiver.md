---
'livekit-client': patch
---

Stop the transceivers of a track when it is unpublished or when the server rejects its publish, so that Chrome frees their encoders (about 95 MB per screen share) before the room disconnects. This needs a server with protocol 19 or higher; with an older server the transceivers stay inactive as before.
