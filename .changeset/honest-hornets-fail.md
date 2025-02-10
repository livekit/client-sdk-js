---
'livekit-client': patch
---

Add backupCodecPolicy to TrackPublishDefaults

The default policy of backup codec is `codec regression` for maxium compatibility, which means the publisher stops sending primary codec and all subscribers will receive backup codec even primary codec is supported. 
It changes the default behavior `multi-codec simulcast` in the previous version, will not break the functionality of the previous version but only cause potential extra bandwidth usage. The user can set the policy to `multi-codec simulcast` to keep the previous behavior.
 