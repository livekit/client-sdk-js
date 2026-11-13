---
'livekit-client': patch
---

Wait for mixed Web Audio output routing before confirming an output switch, and propagate routing failures. Preserve newer microphone mute intent during pending capture, publication, fallback, processor adoption, and republishing, so an obsolete operation cannot enable or mute capture after a later user request.
