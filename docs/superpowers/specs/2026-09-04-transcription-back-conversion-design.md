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

This spec covers **client-sdk-js only**. The corresponding agents-framework change is out of scope
and tracked separately. No components-js change is required (see "components-js impact").

## Decisions

### Protocol 3

`src/version.ts`:

```ts
/** The client back-converts `lk.transcription` text streams into transcription events, so senders
 * may omit the legacy `Transcription` data packet. */
export const CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS = 3;

export const clientProtocol = CLIENT_PROTOCOL_TRANSCRIPTION_STREAMS;
```

The contract has two halves:

- **Client side (this spec):** advertise protocol 3, meaning "I reconstruct transcription events
  from the `lk.transcription` stream channel — you need not publish the legacy `Transcription`
  packet to me."
- **Agent side (out of scope, stated here for the record):** inspect the client participants; if
  every one of them advertises `clientProtocol >= 3`, publish **modern only**, otherwise publish
  **modern + legacy**.

### No gate: always back-convert, never read legacy

The client behavior is unconditional:

1. `lk.transcription` streams are **always** back-converted into `RoomEvent.TranscriptionReceived`
   (plus the matching `ParticipantEvent` and `TrackEvent`).
2. Incoming legacy `Transcription` data packets are **always** ignored. The
   `packet.value.case === 'transcription'` branch in `Room.handleDataPacket` (`Room.ts:2101`) becomes
   an explicit ignore with a debug log, rather than dispatching to `handleTranscription`.

`handleTranscription` (`Room.ts:2176`) survives as the emit path, now driven solely by the converter.

**This rests on one assumption, confirmed as acceptable:** every agents SDK release publishes at
least the modern channel. Modern transcriptions landed in the 1.0 development cycle on 2025-02-21
(`Add text stream sink and multi text sink`, `#1497`), so this excludes only pre-1.0 frameworks,
which are explicitly not supported.

Why unconditional rather than gated:

- **A per-agent gate is unimplementable.** `lk.transcription` streams are published on behalf of the
  transcribed participant: the outgoing packet sets `participant_identity` to the sender-identity
  override (`rust-sdks/livekit/src/room/participant/local_participant.rs:624`), and `DataPacket`
  carries no second "true sender" field. A receiver can tell *which participant was transcribed*,
  never *which agent produced the stream*. So the client cannot make per-agent decisions about
  stream-sourced transcriptions at all.
- **A room-wide gate cannot be made correct either.** A protocol-3 agent drops the legacy publish
  *per recipient*, so "this agent advertises 3" does not imply "no legacy packet will reach me", and
  a mixed-version room admits no gate setting that is simultaneously duplicate-free and lossless.
  Ignoring legacy outright sidesteps the entire question.
- **There is no version signal that would make a gate better-informed.** See the evidence appendix:
  `clientProtocol` did not exist before 2026-05-20, 14 months after modern transcriptions shipped,
  and no agents-framework version is observable to other participants.

**This takes effect immediately, not once agents ship protocol 3.** Today's agents advertise
protocol 2 and publish both channels; from this change on, the SDK ignores their legacy packets and
sources transcription events from their streams instead. So `RoomEvent.TranscriptionReceived`
becomes stream-derived for the entire current fleet on upgrade. The bandwidth win arrives later,
when agents act on protocol 3 — but the behavior change lands now, which is what raises the stakes
on the fidelity rules below. The changeset must call this out as a behavior change.

Accepted consequence: any non-agent publisher of legacy `Transcription` packets — a bespoke service
calling `publish_transcription` directly, or a pre-1.0 agents framework — no longer surfaces at all.
There is no client-to-client case to break: this SDK exposes no `publishTranscription` API, so it can
only ever receive legacy transcriptions.

### Why no new room event

An earlier iteration added a room event carrying stream-sourced transcriptions alongside the legacy
one. It was dropped: every transcript now reaches `RoomEvent.TranscriptionReceived` exactly once, so
a second event would only duplicate it. Applications that want stream-only metadata
(`lk.expression`, custom attributes, `json_format` timings) continue to read the raw stream via
`registerTextStreamHandler('lk.transcription', ...)`, which keeps working (see "Plumbing").

`RoomEvent.TranscriptionReceived` keeps its exact signature — `(segments, participant?,
publication?)` with `TranscriptionSegment[]` — and simply changes source. Same for the matching
`ParticipantEvent` and `TrackEvent`.

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

Each update produces a synthetic `Transcription` message fed into `Room.handleTranscription`
(`Room.ts:2176`), so participant/publication resolution and `firstReceivedTime`/`lastReceivedTime`
bookkeeping come free from `extractTranscriptionSegments` (`src/room/utils.ts:682`) and the
`transcriptionReceivedTimes` map.

### Fidelity rules

These are the places where a naively synthesized event differs from what the legacy channel
produced. Each is required for the "existing applications keep working" claim, and each applies to
today's agents immediately.

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

`src/room/data-stream/incoming/IncomingDataStreamManager.ts` becomes a typed event emitter
(`TypedEmitter<IncomingDataStreamManagerCallbacks>`, with the callbacks declared in a sibling
`events.ts` per the manager pattern) and taps the reserved transcription topic with a
**`transcriptionStreamArrived`** event carrying `{ reader, participantIdentity }`. `Room` subscribes
to it rather than registering a handler for the topic, so the topic itself stays available to
applications.

The event is named for the *stream* arriving, not a transcription: it fires when the stream opens,
before any text has been read, and deliberately avoids the legacy `transcriptionReceived` name.

Internally that means the text path delivers to N consumers instead of one. In `handleStreamHeader`,
build an **independent** `TextStreamReader` per consumer — the application handler for the topic,
plus a synthetic consumer that emits the event when the topic matches and something is listening;
generalize `textStreamControllers` (`:36`) from one controller per stream id to a list, and push to
all of them in `handleStreamChunk` / `handleStreamTrailer`. All consumers of a stream share one
`info` object, so a trailer's attribute merge (how `lk.transcription_final` arrives) reaches every
reader.

Gating the synthetic consumer on `listenerCount('transcriptionStreamArrived') > 0` preserves today's
"no consumer, ignore the stream" behavior, and the application handler path is untouched — which is
what allows components-js to remain untouched.

This is the bulk of the implementation work.

### Wire-up and lifecycle

- Instantiate the converter in `Room` alongside `incomingDataStreamManager` and subscribe it to the
  manager's `transcriptionStreamArrived` event.
- Add `TRANSCRIPTION_TOPIC = 'lk.transcription'` to `src/room/data-stream/constants.ts`, read by the
  manager when deciding whether to tap a stream.
- Reuse the existing `TranscriptionAttributes` keys from `src/room/attribute-typings.ts`.
- Clear converter state on disconnect alongside `transcriptionReceivedTimes.clear()` and
  `incomingDataStreamManager.clearControllers()` (`Room.ts:1835-1836`).

## components-js impact

None required.

- `useTranscriptions` and `useAgentExpression` keep reading raw `lk.transcription` streams through
  the fan-out, so Expressive Mode (`lk.expression`) is unaffected.
- `useTrackTranscription` and `useVoiceAssistant` read `TrackEvent.TranscriptionReceived` and
  therefore keep working, now sourced from streams instead of legacy packets — no code change.

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

**Legacy packets ignored:** an incoming `Transcription` data packet emits no transcription events
from any of the three emitters.

**Fan-out:** an `lk.transcription` stream reaches both a `transcriptionStreamArrived` subscriber and
an application-registered handler, each through its own reader; trailer attributes surface on both;
the event does not fire for other topics; the no-consumer case still ignores the stream.

**Whole-suite:** `npx tsc --noEmit` and `npx vitest run`.

**End-to-end:** simulate an agent publishing `lk.transcription` streams with the transcription
attributes (extend `examples/data-stream-transcription-benchmark/`), then `pnpm link` the built SDK
into components-js and confirm `useTrackTranscription` / `useVoiceAssistant` render those
transcriptions through the unmodified legacy events.

## Evidence appendix

Findings from the investigation that the decisions above rest on.

**The two channels share no segment id.** `_ParticipantTranscriptionOutput`
(`agents/livekit-agents/livekit/agents/voice/room_io/_output.py:672`) fans out to two independent
sinks, `_ParticipantLegacyTranscriptionOutput` and `_ParticipantStreamTranscriptionOutput`, each
generating its own `utils.shortuuid("SG_")` in `_reset_state()`. agents-js does the same
(`ParticipantLegacyTranscriptionOutput` / `ParticipantTranscriptionOutput`, both `shortuuid('SG_')`).
No cross-channel deduplication key exists — which is why the design ignores one channel outright
rather than attempting to merge them.

**Legacy carries nothing the stream channel lacks.** Agents hardcode `start_time=0`, `end_time=0`,
`language=""` in the legacy proto (`_output.py:376-383`), so back-conversion is lossless in
practice. The reverse is not: `lk.expression` is stripped and discarded on the legacy path
(`strip_all_markup`, with the comment at `_output.py:341` noting the legacy API has no attribute
channel), and custom attributes and `json_format` timings have no legacy representation. Preferring
the stream channel is therefore the strictly richer choice.

**Timeline.** Modern transcriptions landed 2025-02-21 (`#1497`), followed by RoomIO on 2025-02-24
(`#1548`). The rust SDK did not advertise `client_protocol` at all until 2026-05-20 (`#1013`, value
1), bumping to 2 on 2026-07-28 (`#1192`). So `clientProtocol >= 1` is not a usable proxy for
"publishes modern transcriptions": every release in the 14-month window between those dates
publishes the stream channel while advertising 0.

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
