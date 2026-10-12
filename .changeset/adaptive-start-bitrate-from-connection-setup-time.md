---
'livekit-client': patch
---

Scale the `x-google-start-bitrate` hint by connection setup time: the 1 Mbps camera cap now applies to connections that set up within 1.5 s and ramps linearly down to 300 kbps at 3.5 s or slower; screen share stays uncapped.
