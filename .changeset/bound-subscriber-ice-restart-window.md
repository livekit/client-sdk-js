---
'livekit-client': patch
---

Fix the subscriber silently buffering remote ICE candidates after a resume

`triggerIceRestart` marked the subscriber as awaiting a fresh ICE generation on every resume,
but only `setRemoteDescription` cleared it — and the server re-offers the subscriber only when
the resume moved the participant to a different node. After an ordinary signal-only resume no
offer arrives, so the flag stayed set for the lifetime of the transport and every subsequent
remote candidate was queued instead of applied, leaving the subscriber unable to adopt any new
network path the server proposed.
