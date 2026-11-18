---
'livekit-client': patch
---

Await `AudioContext.setSinkId()` when switching the audio output with `webAudioMix` enabled, so the switch only resolves (and emits `ActiveDeviceChanged`) once routing succeeds, and routing failures reject instead of becoming unhandled rejections
