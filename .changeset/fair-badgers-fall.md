---
'livekit-client': patch
---

Fall back to the default device for the camera as well as the microphone when a local track ends unexpectedly (e.g. a device is unplugged). Previously, only the microphone restarted against `deviceId: 'default'`; the camera restarted with its previous constraints, which still pointed at the now-gone device, so `getUserMedia` failed again and the track was muted instead of switching to another camera.
