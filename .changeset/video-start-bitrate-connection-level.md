---
'livekit-client': patch
---

Write the `x-google-start-bitrate` hint as a single connection-level value, once per publisher connection.

libwebrtc reads this fmtp parameter per m-section but applies it to the shared `Call` (`WebRtcVideoSendChannel::ApplyChangedParams` → `SetSdpBitrateParameters`), where `RtpBitrateConfigurator` holds one config for the whole peer connection. Differing per-section values were therefore last-writer-wins on m-section order, so publishing a camera and a screen share together could seed the estimator from either one depending on SDP layout. Every video section now carries the same value: the largest hint among the sections that are currently sending.

Only sending sections count. The list of registered track bitrates is append-only, and an unpublished section keeps its `a=msid`, so matching a section to a track by msid alone would still pair a stale entry with the section it used to occupy — letting an uncapped screen-share target seed a connection that now carries only a camera, or consuming the one-shot hint on a section that sends nothing, which would leave later publishes with no hint at all. `a=sendonly` distinguishes a live send from an unpublished (`a=inactive`) or pre-populated (`a=recvonly`) section.

The hint is also written only on the first offer that carries local video, instead of on every offer. libwebrtc retains `start_bitrate_bps` and re-applies it on network route changes (`RtpTransportControllerSend::OnNetworkRouteChanged`), so rewriting it later is at best a no-op and at worst restarts a converged bandwidth estimator. A full reconnect builds a new peer connection and seeds the new estimator again.

Targets below 300 kbps now get no hint, matching the Rust SDK: below that, seeding above the real capacity costs more than the ramp it saves.
