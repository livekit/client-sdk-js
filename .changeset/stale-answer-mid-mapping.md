---
'livekit-client': patch
---

Keep the mid to track id mapping of the current publisher answer when an answer to an older offer or an answer with an empty mapping arrives in single peer connection mode, so remote tracks whose `track` event fires later are no longer dropped
