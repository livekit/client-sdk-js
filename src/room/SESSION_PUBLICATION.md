# Internal Session publication startup

Applications keep their existing Components Session configuration. There is no public
preparation API or initial-publication connect option. Session starts room connection
and device capture concurrently; credential acquisition and JOIN never wait for a device.

Components and the SDK share a versioned internal symbol,
`Symbol.for('livekit.internal.sessionPublication.v1')`. The room installs a non-enumerable
bridge with prepare/connect operations. It is absent from the public entry exports and
Room declarations. Components uses ordinary publication when the bridge is unavailable.
This is a private integration protocol, not a supported application API.

The bridge snapshots source, format and publication defaults/options. Eligible V1
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
