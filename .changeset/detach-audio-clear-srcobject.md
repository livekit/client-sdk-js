---
'livekit-client': patch
---

Stop playing a remote audio track in Chrome once it is detached. `detachTrack` removed the audio track from the element's stream before setting `srcObject` to `null`, and Chrome silences only the tracks still in the stream when an element stops, so the detached track kept playing whenever another remote audio element in the page was playing. In Chromium-based browsers it now sets `srcObject` to `null` first. Firefox and Safari already stopped the track and keep the previous behavior.
