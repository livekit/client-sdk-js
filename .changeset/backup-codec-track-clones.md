---
'livekit-client': patch
---

Backup codecs now follow the track after `replaceTrack`, an unmute of an SDK managed camera or a processor change. Before this fix they kept sending the clone taken at publish time, so a backup codec subscriber could see the old track or no video at all, and the clone was never stopped, which kept the camera on.
