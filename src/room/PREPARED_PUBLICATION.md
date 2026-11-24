# Prepared publications

There is no public preparation API, connect option or private integration protocol.
`setMicrophoneEnabled()` reserves the microphone publication while the device is still being
captured, in any room state, so the publication does not wait for the device.
`setCameraEnabled()` waits for capture, because the captured dimensions can differ from the
requested ones. `publishTrack()` called before the signal connects reserves a microphone or
camera track that already exists. Its format comes from the track, the stereo decision is the
one `publishTrack()` makes anyway, and the AddTrack request carries the track's own mute state.
Like any publication made before the signal connects, it gives up after 15 s.

The reservation snapshots source, format and publication defaults/options. A reservation that
exists when the JOIN offer is built goes into the JOIN: the engine adds a sendonly transceiver
without a track, reads the CID from the stream MSID in the initial offer, and sends the AddTrack
request with the JOIN. Any later reservation is registered as soon as the publisher is
negotiated: right after the JOIN answer while connecting, at once when connected. It reads the CID
from a probe offer, sends the AddTrack request and renegotiates. A reservation made before
capture carries `muted: true`, so others see a muted microphone until capture attaches media. The
unmute goes out right before `replaceTrack`, because the SFU drops media of a track it thinks is
muted. A reservation from `publishTrack()` carries the track's own mute state. Registrations run one at a time, so a reservation is never registered twice.
Unsupported modes, codecs, encryption or changed formats use ordinary publication. Backup codec
policy must be normalized before eligibility checks.

PreparedPublicationState owns every speculative sender until publication commits,
including fallback senders. Cancellation waits for any in-flight sender creation and
negotiation, removes the sender and listeners, and clears pending registration before
releasing the attempt. Caller-owned media is not stopped. `setMicrophoneEnabled()` stops media
it captured when publishing fails.

PCTransport records reserved outgoing transceivers separately from receive placeholders.
A sender without a track is not sufficient to classify a section as receive-only.
BUNDLE conformance uses outgoing parameters as canonical and rewrites placeholders.

Preconnect-buffer subscription listeners are installed before LocalTrackPublished is
emitted. CoreRoom may synchronously replay a subscription received before device capture
at that event; emitting first would lose it. Regression coverage drives that replay
through the actual local publication pipeline.

Only subscription SIDs acknowledged for a live reservation are retained across a long
permission wait. Unrelated publications keep the ordinary ten-second event deferral.

Reservations belong to the room. Disconnect and dispose cancel all of them. A full reconnect
drops the reserved senders, and the engine registers the waiting reservations again after the
new JOIN answer.
