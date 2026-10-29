---
'livekit-client': patch
---

Fix `sendText` upload progress stopping below 100% after a compressed chunked text stream completes, including sends with attachments.
