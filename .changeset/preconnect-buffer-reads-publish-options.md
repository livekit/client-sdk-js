---
'livekit-client': patch
---

Fix the microphone pre-connect buffer never starting when `preConnectBuffer` is passed via publish options. `setTrackEnabled` decided whether to call `startPreConnectBuffer()` from the capture options instead of the publish options, so `setMicrophoneEnabled(true, captureOptions, { preConnectBuffer: true })` was silently ignored — the buffer never recorded and no `TF_PRECONNECT_BUFFER` feature was published, so agents received no pre-connect audio. The check now reads `preConnectBuffer` from the publish options, where it is documented to live. Passing it in `publishDefaults` continues to work.
