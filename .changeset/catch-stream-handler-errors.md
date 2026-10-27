---
'livekit-client': patch
---

Errors thrown or rejected by a registered text or byte stream handler no longer surface as unhandled promise rejections. Previously an `async` handler that did not wrap its reads in `try`/`catch` produced an uncatchable unhandled rejection whenever a stream ended abnormally (the sender or the local room disconnecting mid stream). Abnormal ends are now logged at debug level and any other handler error is logged as an error. `TextStreamHandler` and `ByteStreamHandler` are now typed as returning `void | Promise<void>`.
