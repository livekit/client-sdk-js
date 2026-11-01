---
'livekit-client': patch
---

Stop the transceivers of a track when it is unpublished, including the backup codec transceivers, and when the server rejects its publish. Before, each publish and unpublish cycle left a transceiver that kept its encoder until the room disconnected (about 95 MB per screen share in Chrome).
