---
"livekit-client": patch
---

Fix the reliable data channel dying under concurrent / multi-packet writes (#1995). Data-channel sends now use two-watermark flow control (fill up to a high-water mark, resume when drained to a low-water mark) and serialize contended senders through a per-kind lock, which prevents the SCTP send buffer from overflowing while keeping throughput saturated for data tracks.
