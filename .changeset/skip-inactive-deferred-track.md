---
'livekit-client': patch
---

Skip a remote track whose `track` event fired while connecting when the server stopped sending it before the room connected, so a failed subscription is no longer reported as subscribed in single peer connection mode
