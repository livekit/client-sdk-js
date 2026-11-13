---
'livekit-client': patch
---

Stop re-sending the whole keyring to the E2EE worker on each `enable` acknowledgement, which made the worker re-derive every key once per remote publication and delayed new keys behind that work. On `SignalConnected`, only post the keys the worker has not received yet. Log the per-frame missing key warning only when the throttled `MissingKey` error is emitted.
