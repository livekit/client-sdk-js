---
'livekit-client': patch
---

Stop re-sending every shared key to the E2EE worker on each `enable` acknowledgement, which made the worker re-derive the whole keyring once per remote publication and delayed new keys behind that work, and log the per-frame missing key warning only when the throttled `MissingKey` error is emitted
