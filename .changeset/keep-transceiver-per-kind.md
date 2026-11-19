---
'livekit-client': patch
---

Keep the last audio transceiver and the last video transceiver of the publisher connection when you unpublish their tracks. After a stop of all transceivers, some browsers gave the next track new header extension ids, and the publish failed.
