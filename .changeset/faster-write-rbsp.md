---
'livekit-client': patch
---

Speed up the emulation prevention step for encrypted H.264 and H.265 frames. `writeRbsp` now returns the input unchanged when no byte needs escaping, and otherwise copies runs of bytes instead of building a JS array. The output does not change.
