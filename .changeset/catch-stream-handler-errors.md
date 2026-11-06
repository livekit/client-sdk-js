---
'livekit-client': patch
---

A text or byte stream handler that fails after the room has disconnected (for example an `async` handler that doesn't catch the error from a stream cut short by the disconnect) is now logged as a warning instead of surfacing as an unhandled promise rejection. Handler errors while the room is connected or reconnecting are unchanged. `TextStreamHandler` and `ByteStreamHandler` are now typed as returning `void | Promise<void>`.
