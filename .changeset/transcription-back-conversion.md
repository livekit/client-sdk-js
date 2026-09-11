---
'livekit-client': minor
---

Rebuild transcription events from `lk.transcription` data streams and advertise client protocol 3

`RoomEvent.TranscriptionReceived` (and the matching `ParticipantEvent` / `TrackEvent`) are now
sourced from the `lk.transcription` text stream channel rather than legacy `Transcription` data
packets, which are ignored from this release on. The event signature is unchanged.

**This is a behavior change that takes effect immediately, not once agents adopt protocol 3.**
Agents currently publish both channels; this release reads the stream channel and drops the legacy
one. Advertising client protocol 3 additionally lets agents stop publishing the legacy copy
altogether, roughly halving reliable-channel traffic for transcriptions — a significant improvement
on constrained uplinks.

Applications reading `lk.transcription` directly via `registerTextStreamHandler` are unaffected: the
SDK observes the topic internally without taking it over. Any non-agent publisher of legacy
`Transcription` packets (a bespoke service calling `publish_transcription`, or a pre-1.0 agents
framework) no longer surfaces.
