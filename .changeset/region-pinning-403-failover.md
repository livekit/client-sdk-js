---
'livekit-client': patch
---

Retry against other LiveKit Cloud regions when the initial connection is rejected with 403. Cloud signals project-level region pinning with a 403 on the RTC paths, which was previously treated as terminal, so a client that geo-routed to a disallowed region never reached `/settings/regions` and failed to connect. 401 and the 404 "room does not exist" case remain terminal.
