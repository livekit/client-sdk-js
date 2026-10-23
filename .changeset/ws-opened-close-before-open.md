---
'livekit-client': patch
---

Reject `WebSocketStream.opened` when the socket closes before it opens without an `error` event, so a failed signal (re)connect on React Native iOS no longer holds the connection lock forever
