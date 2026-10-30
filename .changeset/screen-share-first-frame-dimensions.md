---
'livekit-client': patch
---

Wait for the first frame of a screen share before reading its dimensions, so its simulcast layers are announced at the size the capture delivers instead of the requested resolution.
