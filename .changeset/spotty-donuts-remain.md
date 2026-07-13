---
'livekit-client': patch
---

Keep attached audio elements muted in startAudio() when webAudioMix is enabled, preventing double playback on platforms where element.volume has no effect (e.g. iOS Safari)
