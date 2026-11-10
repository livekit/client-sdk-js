---
'livekit-client': patch
---

Stop `Room.getLocalDevices()` without a kind from calling `getUserMedia` when every device is already listed with a label.
