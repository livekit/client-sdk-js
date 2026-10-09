---
'livekit-client': minor
---

Release the audio contexts and web audio graphs the SDK creates. Previously they accumulated over mute/unmute cycles. They are now collected after `room.disconnect()`.

- `detectSilence` tears its context down on the throw path as well as the happy one.
- The cleanup from `createAudioAnalyser` disconnects its nodes before it closes the context, and it is now idempotent.
- The shared empty audio stream track is refcounted. `releaseEmptyAudioStreamTrack` is a new export, and its context closes once the last clone is handed back.
- If `webAudioMix` is an object without an `audioContext`, a room now closes the context it created for itself.
- When the underlying track is replaced, audio processors are passed the audio context. This lets them rebuild their filter nodes on unmute. Previously they left the old nodes behind.
- The iOS dummy audio element and its `visibilitychange` listener are torn down on disconnect. Previously the listener outlived every room on the page.

This also fixes a false `AudioSilenceDetected`. Silence detection read a zero-filled buffer from a context that never reached `running`. An autoplay-blocked page therefore reported silence on every track it checked.

Three further behavior changes to be aware of:

- A track retained across rooms loses its audio processor. `room.disconnect({ stopTracks: false })` detaches the track from the audio context, which stops the processor. Call `setProcessor` again after you republish the track.
- Under `webAudioMix`, every attached element is muted, not only the first one. A second attached element no longer plays the track twice. When the audio context goes away, those elements are unmuted again and their volume is restored.
- `Participant.setAudioContext` and `LocalAudioTrack.setAudioContext` now return a promise. Both are marked `@internal`, but both appear in the published type declarations.
