---
'livekit-client': patch
---

Add internal `setWrapperSdkInfo` so SDKs built on top of livekit-client (e.g. Unity WebGL) report their own SDK and version in `ClientInfo`, with livekit-client's version in `other_sdks`
