---
'livekit-client': patch
---

Reject `WebSocketStream.opened` when the socket closes before it opens, so that a failed, timed-out or aborted signal (re)connect on React Native no longer holds the connection lock.
