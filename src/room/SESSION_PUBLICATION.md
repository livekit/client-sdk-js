# Internal Session publication startup

There is no public preparation API, connect option or private integration protocol. An app (or
the Components Session) calls `setMicrophoneEnabled()` together with `connect()`, as it already
does. While the room is disconnected, that call asks the room to reserve a microphone sender from
the capture and publish options, and the next `connect()` claims the reservation. JOIN never waits
for the device. Calls made while connecting or connected publish as before. Camera publication
always waits for capture, because the captured dimensions can differ from the requested ones.

The reservation snapshots source, format and publication defaults/options. Eligible V1
single-PC connects reserve trackless outgoing transceivers, register response waiters
before signaling, and include publication requests with the initial offer. Capture
later attaches media. Unsupported modes, codecs, encryption or changed formats use
ordinary publication. Backup codec policy must be normalized before eligibility checks.

PreparedPublicationState owns every speculative sender until publication commits,
including fallback senders. Cancellation waits for any in-flight sender creation and
negotiation, removes the sender and listeners, and clears pending registration before
releasing the attempt. Caller-owned media is not stopped. Session stops media it captured.

PCTransport records reserved outgoing transceivers separately from receive placeholders.
A sender without a track is not sufficient to classify a section as receive-only.
BUNDLE conformance uses outgoing parameters as canonical and rewrites placeholders.

Preconnect-buffer subscription listeners are installed before LocalTrackPublished is
emitted. CoreRoom may synchronously replay a subscription received before device capture
at that event; emitting first would lose it. Regression coverage drives that replay
through the actual local publication pipeline.

Only subscription SIDs acknowledged for a live initial reservation are retained across a long
permission wait. Unrelated publications keep the ordinary ten-second event deferral.

Reservations belong to one internal Session startup attempt. Disconnect cancels all of them,
including unclaimed reservations; retaining them for a future connect is not supported.
If browser preparation fails, PC teardown/reconfiguration happens before JOIN is sent.
Reconfiguration reinstalls the state callback, then joins without initial publications.
This adds local PC setup work on that exceptional path, rather than a failed server JOIN RTT.
