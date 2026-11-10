---
'livekit-client': patch
---

Stop logging `error reading from signal stream` at error level when the signal socket was closed by the client or replaced; the read failure is now logged at debug level with the ignored close
