---
'livekit-client': patch
---

Stop Firefox subscribers from negotiating AV1, which Firefox 155 turned on for WebRTC while still having no SVC support ([bugzilla 1571470](https://bugzilla.mozilla.org/show_bug.cgi?id=1571470)). Such a subscriber was served a publisher's AV1 SVC stream in place of its backup codec and decoded only the base spatial layer, so any subscription selecting a higher one (a large element under adaptive stream) rendered black or frozen. AV1 is now excluded from the codecs Firefox offers to receive on, which makes the SFU forward the backup codec — the receive-side counterpart of the existing `supportsAV1()` gate on publishing.

One consequence: a Firefox subscriber can no longer receive an AV1 track published with no backup codec at all, which in practice means an end-to-end encrypted one, since backup codecs are skipped when encryption is on. Such a track previously played its base spatial layer at small sizes.
