# Transcription back-conversion: client protocol 3

**Status:** approved design, not yet implemented
**Supersedes:** `TRANSCRIPTION_UNIFICATION_PLAN.md` (repo root) — its `clientProtocol >= 2`
room-wide gating and its components-js phase are both obsolete.

## Problem

Agents publish every transcription **twice** over the reliable data channel: once as a legacy
`Transcription` data packet, and once as a `lk.transcription` text stream. On a poor uplink (mobile)
the doubled traffic saturates the channel, and unrelated reliable traffic suffers — RPCs time out,
data streams arrive partially.

Data Streams V2 (single-packet + compression) does not help here. Transcriptions are the worst case
for compression: payloads are frequently single words, where deflate framing overhead exceeds any
savings.

The fix is to stop sending the legacy copy. That requires a signal an agent can use to know the
receiving client no longer needs it — a new client protocol version — and it requires the client to
reconstruct the legacy transcription events from the stream channel so existing applications keep
working.

## Scope

This spec covers **client-sdk-js only**. The corresponding agents-framework change (skip the legacy
publish when every recipient advertises protocol 3) is out of scope and tracked separately. No
components-js change is required (see "components-js impact").

## Decisions

### Protocol 3

`src/version.ts`:

```ts
/** The client back-converts `lk.transcription` text streams into transcription events, so senders
 * may omit the legacy `Transcription` data packet. */
export const CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS = 3;

export const clientProtocol = CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS;
```

The contract is **bidirectional**, and both halves must be documented because the SDK reads the
value off remote participants as well as advertising its own:

- **As a client:** "I back-convert `lk.transcription` streams into transcription events. You may
  stop publishing legacy `Transcription` packets to me."
- **As an agent:** "I publish every transcription on the `lk.transcription` stream channel."

### Gate: `some(agent >= 3)` plus legacy suppression

```
backConvert = remoteAgents.some(a => a.clientProtocol >= CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS)
```

where `remoteAgents` is the remote participants for which `Participant.isAgent`
(`src/room/participant/Participant.ts:115`) holds. The predicate is cheap, so it is evaluated
lazily at each decision point rather than cached and invalidated. While `backConvert` is true:

1. `lk.transcription` streams are converted into transcription events, and
2. legacy `Transcription` packets **whose sender is an agent-kind participant** are dropped.

Legacy packets from non-agent senders (an application calling `publishTranscription`, egress STT)
are never suppressed.

Rationale for each half:

- **Suppression is required for correctness, not just tidiness.** An agent at protocol 3 drops the
  legacy publish *per recipient*: if an older client shares the room, it must keep publishing legacy
  for that client. Gating on "the agent advertises 3" therefore does **not** imply "no legacy packet
  will reach me". Suppressing legacy from agent senders while converting removes the assumption
  entirely — and it is always possible, because legacy packets carry their true sender
  (`DataPacket.participant_identity`), unlike stream packets.
- **`some`, not `every`, resolves mixed-version rooms.** With agent A at protocol 3 (modern only)
  and agent B at protocol 2 (both channels), `every` would leave conversion off, and A's
  transcripts would never reach any transcription event because A published no legacy copy. With
  `some` plus suppression, A's streams are converted, B's streams are converted, and B's legacy
  packets are discarded — every transcript is emitted exactly once.
- **Today's behavior is unchanged.** No released agent advertises protocol 3, so the gate is false
  and every existing code path is untouched.

Accepted limitation: a **pre-1.0** agents framework (legacy transcriptions only, i.e. before
2025-02-21) sharing a room with a protocol-3 agent would have its transcripts suppressed. Every
release from 1.0 onward publishes the stream channel, so this requires pairing a pre-Feb-2025
framework with a 2026-era protocol-3 agent in one room. Documented, not solved.

### Why not attribute streams to agents

`lk.transcription` streams are published on behalf of the transcribed participant. The outgoing
packet sets `participant_identity` **to the sender-identity override**
(`rust-sdks/livekit/src/room/participant/local_participant.rs:624`), and `DataPacket` carries no
second "true sender" field. A receiver therefore cannot tell which agent produced a given stream —
only which participant was transcribed. Every per-agent scheme on the *stream* side is unimplementable
for this reason; the decision above only ever makes per-agent judgments on the *legacy* side, where
attribution exists.

### Why no new room event

An earlier iteration added a room event carrying stream-sourced transcriptions alongside the legacy
one. It was dropped: with `some(>= 3)` plus suppression, every transcript already reaches
`RoomEvent.TranscriptionReceived` exactly once, so a second event would only duplicate it.
Applications that want stream-only metadata (`lk.expression`, custom attributes, `json_format`
timings) continue to read the raw stream via `registerTextStreamHandler('lk.transcription', ...)`,
which keeps working (see "Plumbing").

`RoomEvent.TranscriptionReceived` keeps its exact signature — `(segments, participant?,
publication?)` with `TranscriptionSegment[]` — and simply gains stream-sourced segments. Same for
the matching `ParticipantEvent` and `TrackEvent`.

## Design

### `TranscriptionStreamConverter`

New `src/room/transcription/TranscriptionStreamConverter.ts`. Pure, no `RTCEngine` reference,
unit-tested in isolation per the manager pattern. Shaped as a `TextStreamHandler` consumer,
`(reader, { identity }) => void`.

Partial state keyed by `(segmentId, senderIdentity)`, where
`segmentId = reader.info.attributes['lk.segment_id'] ?? reader.info.id`:

- **Append** each chunk while the stream id is unchanged. The JS `TextStreamReader` async iterator
  yields per-chunk deltas.
- **Replace** the accumulated text when a *different* `reader.info.id` appears for the same segment
  id. This is the user-STT shape: each update is published as a fresh stream sharing one
  `lk.segment_id`, carrying the full text rather than a delta. (Swift's `TranscriptionStreamReceiver`
  calls this `replaceContent`; it is the same rule.)
- **Finality** from `lk.transcription_final` — accepting boolean `true`, `'true'` or `'1'`, since
  agents send the string form — **or** from iterator completion. A delta stream normally carries the
  attribute only on its closing header, so stream close is the primary signal.
- Drop the partial entry once a segment is final.

Each update produces a synthetic `Transcription` message fed into the **existing**
`Room.handleTranscription` (`src/room/Room.ts:2176`), so participant/publication resolution and
`firstReceivedTime`/`lastReceivedTime` bookkeeping come free from `extractTranscriptionSegments`
(`src/room/utils.ts:682`) and the `transcriptionReceivedTimes` map.

### Fidelity rules

These are the places where a naively synthesized event differs from what the legacy channel
produced. Each is required for the "existing applications keep working" claim.

**Track sid.** Resolve in order:

1. `attributes['lk.transcribed_track_id']`.
2. The sender's own `SOURCE_MICROPHONE` publication.
3. The `SOURCE_MICROPHONE` publication of a participant whose `lk.publish_on_behalf` attribute names
   the sender.

The attribute is absent whenever the agent's `find_micro_track_id` throws — notably an agent using
an avatar, which publishes no microphone track itself. Without a resolved sid, `publication` is
undefined, `TrackEvent.TranscriptionReceived` never fires, and `useTrackTranscription` /
`useVoiceAssistant` silently receive nothing.

**Avatar speaker identity.** The legacy channel reported the **avatar worker**
(`_represented_by or _participant_identity`), while the stream's sender identity is the **agent**.
When a participant delegating for the sender exists (`lk.publish_on_behalf === senderIdentity`),
attribute the synthesized transcription to that worker, matching legacy. This also makes the
publication lookup in `handleTranscription` succeed, since the worker is the participant that
actually publishes the audio track.

*Reversible call:* the alternative is to keep the agent as the speaker, which would be a behavior
change for avatar sessions.

**`json_format` payloads.** When an application enables `json_format`, the stream carries JSON
`TimedString` lines instead of raw text, and there is **no wire marker** — no attribute, no distinct
mime type. Sniff per chunk: if it parses as JSON with a string `text` field, unwrap and concatenate
the `text` values, and populate `startTime`/`endTime` from the `TimedString` bounds; otherwise treat
the chunk as raw text.

*Reversible call:* sniffing can in principle misfire on a transcript whose text is itself valid JSON
with a `text` field. The risk is negligible but should be called out in a code comment. The durable
fix is an agents-side marker attribute, which is out of scope here.

**`startTime` / `endTime` / `language`.** Default to `0` / `0` / `''`, which is exactly what agents
write into legacy packets today (`start_time=0, end_time=0, language=""`), so nothing is lost.
Populate the timings only when `json_format` is detected.

### Plumbing: stream fan-out

`src/room/data-stream/incoming/IncomingDataStreamManager.ts` gains an **internal text-stream
observer** registry that runs alongside the public `textStreamHandlers` map (`:40`). In the text path
of `handleStreamHeader`, build an **independent** `TextStreamReader` per applicable consumer;
generalize `textStreamControllers` (`:36`) from one controller per stream id to a list, and push to
all of them in `handleStreamChunk` / `handleStreamTrailer`.

This preserves today's "no handler, ignore the stream" behavior when neither consumer exists, and it
keeps `room.registerTextStreamHandler('lk.transcription', ...)` working — which is what allows
components-js to remain untouched.

This is the bulk of the implementation work.

### Wire-up and lifecycle

- Instantiate the converter in `Room` and register it as the internal observer for
  `lk.transcription` near the existing internal handler registrations (`Room.ts:2590`).
- Add `TRANSCRIPTION_TOPIC = 'lk.transcription'` to `src/room/data-stream/constants.ts`.
- Reuse the existing `TranscriptionAttributes` keys from `src/room/attribute-typings.ts`.
- Evaluate the gate at each incoming `lk.transcription` header, and in `handleDataPacket`
  (`Room.ts:2102`) for the suppression check.
- Clear converter state on disconnect alongside `transcriptionReceivedTimes.clear()` and
  `incomingDataStreamManager.clearControllers()` (`Room.ts:1835-1836`).
- When the last protocol-3 agent disconnects and the gate turns false, **emit a final update for
  every outstanding partial** before discarding the converter state. Silently dropping them would
  leave consumers holding segments that are never finalized.

## components-js impact

None required.

- `useTranscriptions` and `useAgentExpression` keep reading raw `lk.transcription` streams through
  the fan-out, so Expressive Mode (`lk.expression`) is unaffected.
- `useTrackTranscription` and `useVoiceAssistant` read `TrackEvent.TranscriptionReceived` and
  therefore begin working against protocol-3 agents automatically, with no code change.

Consolidating the two pipelines becomes optional cleanup rather than a prerequisite.

## Verification

**Converter unit tests** (`TranscriptionStreamConverter.test.ts`), mirroring Swift's
`TranscriptionTests`:

- delta append within one stream; `final` on stream close
- replace-on-new-stream-id for two streams sharing one `lk.segment_id`
- `lk.transcription_final` parsing: `true`, `'true'`, `'1'`, absent
- segment id falling back to the stream id when `lk.segment_id` is absent
- missing `lk.transcribed_track_id`
- `json_format` chunks unwrapped; raw-text chunks untouched

**Track sid resolution:** attribute present; attribute absent with a sender mic track; attribute
absent with only a `lk.publish_on_behalf` worker mic track; nothing resolvable.

**Gate:** off with no agents; off with a single protocol-2 agent; on with one protocol-3 agent; on in
a mixed protocol-3 + protocol-2 room; legacy packets from agent senders suppressed while on; legacy
packets from non-agent senders never suppressed.

**Fan-out:** an `lk.transcription` stream reaches both the internal converter and an
application-registered handler; other topics unaffected; the no-consumer case still ignores the
stream.

**Whole-suite:** `npx tsc --noEmit` and `npx vitest run`.

**End-to-end:** simulate a `clientProtocol = 3` agent publishing `lk.transcription` streams with the
transcription attributes (extend `examples/data-stream-transcription-benchmark/`), then `pnpm link`
the built SDK into components-js and confirm `useTrackTranscription` / `useVoiceAssistant` render
those transcriptions through the unmodified legacy events.

## Evidence appendix

Findings from the investigation that the decisions above rest on.

**The two channels share no segment id.** `_ParticipantTranscriptionOutput`
(`agents/livekit-agents/livekit/agents/voice/room_io/_output.py:672`) fans out to two independent
sinks, `_ParticipantLegacyTranscriptionOutput` and `_ParticipantStreamTranscriptionOutput`, each
generating its own `utils.shortuuid("SG_")` in `_reset_state()`. agents-js does the same
(`ParticipantLegacyTranscriptionOutput` / `ParticipantTranscriptionOutput`, both `shortuuid('SG_')`).
This is why no cross-channel deduplication key exists, and why the design avoids needing one.

**Legacy carries nothing the stream channel lacks.** Agents hardcode `start_time=0`, `end_time=0`,
`language=""` in the legacy proto (`_output.py:376-383`), so the back-conversion direction is
lossless in practice. The reverse is not: `lk.expression` is stripped and discarded on the legacy
path (`strip_all_markup`, with the comment at `_output.py:341` noting the legacy API has no
attribute channel), and custom attributes and `json_format` timings have no legacy representation.

**Timeline.** Modern transcriptions landed 2025-02-21 (`Add text stream sink and multi text sink`,
`#1497`), followed by RoomIO on 2025-02-24 (`#1548`). The rust SDK did not advertise
`client_protocol` at all until 2026-05-20 (`#1013`, value 1), bumping to 2 on 2026-07-28 (`#1192`).
Consequently `clientProtocol >= 1` is *not* a usable proxy for "publishes modern transcriptions":
every release in the 14-month window between those dates publishes the stream channel while
advertising 0.

**No agents-framework version signal is observable.** `ParticipantInfo` exposes `attributes`,
`kind`, `kind_details`, `client_protocol` and `capabilities`, but no SDK version — `ClientInfo`
(which does carry `sdk` and `version`) is client-to-server only, and `ParticipantInfo.version` is a
state-revision counter. The framework writes exactly one attribute on its own participant
(`room_io.py:431`, `lk.agent.state`), and that predates modern transcriptions (added 2024-09-18,
`#772`). Candidates evaluated and rejected: `lk.agent.inputs` / `lk.agent.outputs` (in the
attribute-definitions schema, written by nothing in either agents repo); `lk.agent.name` (2026-01-30,
`#4670`, and only set for named dispatch); the `roomio_audio` audio track name (1.0-era and disjoint
from pre-1.0's `assistant_voice`, but user-overridable since 2025-08-06, `#3029`);
`lk.agent.state === 'idle'` (in the type since 2025-04 but never actually published —
`_update_agent_state` is only called with `"initializing"` and `"listening"`).
