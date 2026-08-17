---
'livekit-client': patch
---

Fix the subscriber silently buffering remote ICE candidates after a reconnect

`triggerIceRestart` put the subscriber into `restartingIce` on every reconnect, but only
`setRemoteDescription` clears that — and the server re-offers the subscriber only when the
reconnect moved the participant to a different node. After an ordinary signal-only resume no
offer arrives, so the flag stayed set for the lifetime of the transport and every subsequent
remote candidate was queued instead of applied, leaving the subscriber unable to adopt any new
network path the server proposed. The subscriber no longer enters that state: the server does
not send candidates ahead of the offer that introduces them, so queueing them gains nothing.
