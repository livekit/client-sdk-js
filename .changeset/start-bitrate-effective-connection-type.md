---
'livekit-client': patch
---

Lower the camera `x-google-start-bitrate` hint further when the browser reports a slow connection (`navigator.connection.effectiveType`, Chromium only): 300 kbps for `2g` and `slow-2g`, 500 kbps for `3g`. The lower of this and the connection setup time cap applies; `4g` and browsers without the API keep the setup time cap alone, and screen share stays uncapped.
