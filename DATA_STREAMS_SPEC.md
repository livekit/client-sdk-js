# Data Streams v2 Specification

## Overview

Data streams let a participant send a finite or open-ended sequence of bytes to one or more other
participants in a LiveKit room over the reliable data channel, routed by a **topic** to a registered
handler on the receiving side. There are two flavors:

- **Text streams** — UTF-8 string content (chat, LLM/agent transcriptions, RPC v2 payloads).
- **Byte streams** — arbitrary binary content (files, blobs).

A stream is always three logical parts on the wire: a **header** (opens the stream, carries
metadata), zero or more **chunks** (the content, split to fit the MTU), and a **trailer** (closes
the stream). All three are `DataPacket`s on the **reliable** channel.

**Data streams v2** adds three optimizations/safeguards on top of the base stream protocol,
negotiated per-recipient via the participant's advertised `clientProtocol` and client capabilities:

1. **Single-packet (inline) sends** — small finite payloads are smuggled entirely into the header
   packet, skipping the chunk/trailer packets (1 packet instead of 3). Gated on `clientProtocol`.
2. **Compression** — finite, fully-known payloads (`sendText`/`sendBytes`/`sendFile`) are deflate-raw
   compressed; incremental writers (`streamText`/`streamBytes`) are never compressed. Gated on the
   `CAP_COMPRESSION_DEFLATE_RAW` capability (separately from `clientProtocol`).
3. **Header size limit** — the header packet must fit the MTU budget, bounding attribute size and
   closing a DoS / oversized-packet vector.

All v2 behavior is invisible to the user-facing API and falls back gracefully when a recipient does
not support it. A v2 sender must interoperate with pre-v2 receivers by sending uncompressed,
multi-packet streams.

---

## Part 1: Client protocol and capabilities

Two independent signals gate v2 features, and they are deliberately separate:

- **`clientProtocol`** — a monotonic integer version. Crossing `>= 2` is a *baseline* commitment:
  the client guarantees it understands inline single-packet streams. There is no opting out of
  baseline v2 behavior.
- **client capabilities** — a set of *optional* feature flags, each advertised independently. They
  cover features a client may or may not be able to do depending on platform/runtime, rather than
  protocol-level invariants. Compression is one of these: a v2 client might still lack a deflate-raw
  codec.

### `clientProtocol`

An integer each participant advertises in its `ParticipantInfo` over the signaling channel (the
same field used by RPC v2). Distinct from the signaling `protocol` version.

| Value | Constant name | Meaning |
|-------|---------------|---------|
| `0` | `CLIENT_PROTOCOL_DEFAULT` | Legacy client. No v2 data-stream features. |
| `1` | `CLIENT_PROTOCOL_DATA_STREAM_RPC` | RPC v2 (see RPC spec). No v2 data-stream features. |
| `2` | `CLIENT_PROTOCOL_DATA_STREAM_V2` | Understands **inline single-packet** data streams. |

### Client capabilities

A set of optional feature flags a client advertises in its `ClientInfo.capabilities` (a repeated
enum) during the join handshake.

| Value | Constant name | Meaning |
|-------|---------------|---------|
| `2` | `CAP_COMPRESSION_DEFLATE_RAW` | The client can **decompress** a deflate-raw compressed stream. |

(Other capability values exist for unrelated features, e.g. `CAP_PACKET_TRAILER`.)

### What SDKs need to do

1. **Advertise `clientProtocol`**: set it to at least `2` (`CLIENT_PROTOCOL_DATA_STREAM_V2`) in the
   join handshake.
2. **Advertise capabilities**: include `CAP_COMPRESSION_DEFLATE_RAW` in `ClientInfo.capabilities`
   when the runtime can decompress deflate-raw (i.e. it has the codec the receive path needs).
3. **Read both, per remote**: store every remote participant's advertised `clientProtocol` (absent
   ⇒ `0`) **and** its advertised capabilities (absent ⇒ empty). Expose a per-participant
   capabilities accessor for the send path.
4. **Use**: before sending a finite stream, gate inline on recipients' `clientProtocol` and
   compression on recipients' capabilities (see "recipient eligibility").

### Recipient eligibility

Eligibility is evaluated over **every** recipient: the named destination identities for a targeted
send, or every remote participant in the room for a broadcast. An **empty room** (no recipients) is
considered eligible. The two v2 features gate independently:

- **Inline single-packet** is eligible when every recipient advertises `clientProtocol >= 2`.
- **Compression** is eligible when every recipient advertises `clientProtocol >= 2` **and**
  `CAP_COMPRESSION_DEFLATE_RAW`, **and** the local runtime can compress deflate-raw.

So a v2 recipient that does not advertise the compression capability still receives **inline**
single-packet sends, but its chunked streams are sent **uncompressed**. If any recipient is pre-v2,
the send falls back to an uncompressed, multi-packet stream — which all clients understand.

---

## Part 2: Wire protocol

All packets are `DataPacket`s sent on the **reliable** data channel. A `DataPacket` carries optional
`destinationIdentities` (empty ⇒ broadcast) and a `value` oneof that, for data streams, is one of
`streamHeader` / `streamChunk` / `streamTrailer`.

### `DataStream.Header`

Opens a stream. Fields:

| Field | Type | Meaning |
|-------|------|---------|
| `streamId` | string | UUID identifying this stream; used to correlate chunks and the trailer. |
| `timestamp` | int64 | Creation time (ms). |
| `topic` | string | Routes the stream to a handler registered for this topic. |
| `mimeType` | string | `text/plain` for text; the file/blob MIME type for bytes. |
| `totalLength` | optional int64 | Total **uncompressed** content byte length for finite streams; absent for unknown-length (incremental) streams. |
| `encryptionType` | enum | `NONE` or `GCM` (see E2EE below). |
| `attributes` | map<string,string> | Caller-supplied metadata only (v2 carries its own signals in dedicated fields, not here). |
| `inlineContent` | optional bytes | The full payload smuggled into the header for single-packet (inline) sends; absent for chunked streams. Deflate-raw compressed iff `compression` is `DEFLATE_RAW`. |
| `compression` | enum (`DataStream.CompressionType`) | `NONE` or `DEFLATE_RAW`; applies to the inline or chunked payload. |
| `contentHeader` | oneof | `textHeader` (`DataStream.TextHeader`) or `byteHeader` (`DataStream.ByteHeader`). |

`DataStream.TextHeader`: `operationType` (`CREATE`/`UPDATE`/`DELETE`/`REACTION`), `version` (int,
for supersede-by-version updates), `replyToStreamId`, `attachedStreamIds` (stream IDs of attached
byte streams, e.g. file attachments to a text message), `generated` (bool, marks
machine/agent-generated text such as transcriptions).

`DataStream.ByteHeader`: `name` (file/blob name).

### `DataStream.Chunk`

One slice of content. Fields:

| Field | Type | Meaning |
|-------|------|---------|
| `streamId` | string | The stream this chunk belongs to. |
| `chunkIndex` | int64 | 0-based, **contiguous** index for ordering and dedup. |
| `content` | bytes | The chunk payload (for text, a UTF-8 slice; for compressed streams, compressed bytes). |
| `version` | int | For text stream updates: supersedes a previously-received chunk at the same `chunkIndex` when higher. Otherwise `0`. |
| `iv` | optional bytes (deprecated) | Initialization vector when the chunk is E2EE-encrypted. |

### `DataStream.Trailer`

Closes a stream. Fields: `streamId`, `reason` (string; empty on normal close), `attributes`
(map<string,string>; merged into the stream's attributes on the receiver at close — lets a sender
append metadata known only after the content, e.g. a final checksum). A conforming v2 sender sends a
trailer carrying only `streamId` on normal close; `reason`/`attributes` are optional extensions.

### Stream lifecycle (multi-packet)

```
Sender                                Receiver
  |                                      |
  |--- streamHeader (topic, attrs) ----->|  (looks up handler by topic, creates a reader)
  |--- streamChunk (index 0) ----------->|  (delivers content as it arrives)
  |--- streamChunk (index 1) ----------->|
  |              ...                     |
  |--- streamTrailer -------------------->|  (merges trailer attrs, closes the reader)
  |                                      |
```

- The receiver routes on `topic`: if no handler is registered for that topic, the stream is ignored
  (chunks/trailer for an unhandled header are dropped).
- Content is delivered incrementally as chunks arrive — a receiver must not wait for the trailer to
  begin yielding content.
- Chunk content larger than the MTU budget is split across multiple chunks with contiguous indices.
    - Text data streams should ALWAYS split text at valid UTF-8 boundaries, which should already be
    implemented for data streams v1. For an example of this behavior, see the relevant web sdk
    code: https://github.com/livekit/client-sdk-js/blob/23326f9c9b85d6babb562d54b6a663f132189880/src/room/utils.ts#L758

### Topics and handlers

The receiving SDK exposes registration of one handler per topic, separately for text and byte
streams. A handler is invoked once per incoming stream (when its header arrives) with a **reader**
object and the sending participant's identity. Handlers must be registered **before** connecting /
before the stream arrives, or the stream is dropped.

### Readers

A reader exposes the stream's `info` (id, topic, mimeType, size, attributes, name for bytes,
encryptionType, etc.) and lets the consumer either:

- **read incrementally** — iterate chunks as they arrive (text yields decoded string pieces; bytes
  yield byte arrays), or
- **read to completion** — await the full concatenated content (string for text, list/array of byte
  arrays for bytes).

The reader counts received content bytes against `totalLength` (when present) and surfaces an error
if the stream ends short, or if more bytes than declared arrive.

---

## Part 3: Send APIs

Five send operations, three finite (full payload known up front) and two incremental:

| API | Content | Payload known up front? | Eligible for inline? | Eligible for compression? |
|-----|---------|-------------------------|----------------------|---------------------------|
| `sendText(text, opts)` | text | yes | yes | yes |
| `sendBytes(bytes, opts)` | bytes | yes | yes | yes |
| `sendFile(file, opts)` _(optional)_ | bytes | yes (streamed from disk) | **no** | yes |
| `streamText(opts) -> writer` | text | no (incremental writes) | no | **no** |
| `streamBytes(opts) -> writer` | bytes | no (incremental writes) | no | **no** |

`sendBytes` is the byte-stream analogue of `sendText`: the whole payload is already in memory, so it
gets the same inline single-packet fast path and one-shot compression. `sendFile` is the special
case for files — the payload is streamed from disk (never buffered) and so does **not** get the
inline path. `sendBytes` does not infer a `name`/`mimeType` from its input; its byte-stream header
defaults to `name = "unknown"` and `mimeType = "application/octet-stream"`.

**`sendBytes`, `sendText`, `streamText`, and `streamBytes` are the required send APIs; `sendFile` is
optional and platform-dependent.** Since `sendBytes` already covers sending an in-memory byte
payload, `sendFile` is only worth adding on platforms that have a native streamable file type whose
contents can be read without buffering the whole thing into memory (e.g. the `File`/`Blob` object in
browser JS, which exposes a `ReadableStream`). On such platforms `sendFile` is a thin convenience
wrapper that derives the `name`/`mimeType` from the file and streams its contents. On platforms with
no such type, omit `sendFile` entirely — callers read the bytes themselves and use `sendBytes`. The
two produce identical wire output for the same bytes (a `byteHeader` stream), so there is no
interop concern in omitting it.

Common options: `topic`, `destinationIdentities` (omit ⇒ broadcast), `attributes`
(map<string,string>), and for the finite APIs a `compress` boolean (default `true`, opt-out).
`sendText` additionally supports `attachments` (each becomes an attached byte stream referenced by
`attachedStreamIds` in the text header). `streamText` additionally supports `type`
(`create`/`update`) and `version` for streaming edits/updates of a prior stream.

The v2 signals are carried in dedicated header fields, **not** attributes: `inlineContent` (the
single-packet payload, as raw bytes) and `compression` (`NONE` / `DEFLATE_RAW`). `attributes` carries
only caller-supplied metadata.

### `sendText` send algorithm

1. Compute the UTF-8 byte length as `totalLength`.
2. **Inline attempt** (only when there are no attachments and all recipients are v2): build a header
   carrying the UTF-8 payload bytes in `inlineContent` with `compression = NONE`. If `compress` and
   the runtime supports compression, deflate-raw the payload and, **only if the compressed form is
   smaller**, put the compressed bytes in `inlineContent` and set `compression = DEFLATE_RAW`. If the
   resulting serialized header packet is `<= STREAM_CHUNK_SIZE_BYTES`, send it as a single packet and
   finish. Otherwise fall through.
3. **Chunked compressed** (when the send is compression-eligible — see Part 1 § Recipient
   eligibility: `compress` set, runtime can compress, and every recipient is v2 **and** advertises
   `CAP_COMPRESSION_DEFLATE_RAW`): send a header with `compression = DEFLATE_RAW` and `totalLength`
   = uncompressed length, then the compressed content as chunks, then the trailer.
4. **Chunked uncompressed** (fallback): send the payload as a normal multi-packet text stream
   (UTF-8-boundary-split chunks), header has `compression = NONE`.
5. Send each attachment as its own byte stream (`sendFile` semantics), referenced by
   `attachedStreamIds` in the text header.

### `sendBytes` send algorithm

`sendBytes` mirrors `sendText` for an in-memory `Uint8Array` (byte-stream header, no attachments):

1. `totalLength` is the payload's byte length.
2. **Inline attempt** (when all recipients are v2): build a byte-stream header carrying the raw
   payload in `inlineContent` with `compression = NONE`. If `compress` and the runtime supports
   compression, deflate-raw the payload and, **only if the compressed form is smaller**, put the
   compressed bytes in `inlineContent` and set `compression = DEFLATE_RAW`. If the serialized header
   packet is `<= STREAM_CHUNK_SIZE_BYTES`, send it as a single packet and finish. Otherwise fall
   through.
3. **Chunked** (fallback): send a byte-stream header (`compression = DEFLATE_RAW` iff
   compression-eligible, else `NONE`) then the payload — deflate-raw compressed when eligible — as
   chunk packets, then the trailer.

### `sendFile` send algorithm

> `sendFile` is **optional** (see the note under the API table): implement it only where the
> platform has a native streamable file type. Where present, it behaves as below; where absent,
> callers use `sendBytes` instead.

`sendFile` is fully streamed from the file's byte stream and is **never** sent inline (file uploads
are an edge case; the inline single-packet optimization is intentionally dropped for them):

1. Compress iff the send is compression-eligible (Part 1 § Recipient eligibility): the `compress`
   option is set (default true), the runtime can compress, and every recipient is v2 **and**
   advertises `CAP_COMPRESSION_DEFLATE_RAW`.
2. Send a byte-stream header with `totalLength` = file size and `compression = DEFLATE_RAW` iff
   compressing.
3. Stream the file's bytes → (deflate-raw if compressing) → chunk packets, then the trailer. The
   whole file is never buffered in memory at once.

Even a tiny file is sent as header + chunk(s) + trailer — there is no inline single-packet fast
path for `sendFile`, because deciding inline-eligibility would require buffering and compressing the
whole file up front. An empty file still produces a well-formed stream (`totalLength` 0 + trailer).

### `streamText` / `streamBytes` (incremental)

Open a header immediately (unknown `totalLength`), then the caller writes content over time; each
write is split into chunks and sent, and `close()` sends the trailer. **Incremental writers are
never compressed**: the platform stream compressor cannot flush mid-stream, and per-write flushing
costs more than it saves at typical write sizes (validated against agent-transcription workloads,
where it *expanded* the wire data). Text writes are split on UTF-8 character boundaries so each chunk
decodes independently.

---

## Part 4: Single-packet (inline) optimization

For small finite text payloads, the entire content is smuggled into the header's `inlineContent`
field (raw bytes) and sent as **one** packet (no chunks, no trailer). The decision is made by
**serializing the candidate header packet and checking its byte length against
`STREAM_CHUNK_SIZE_BYTES`** — if it fits, send inline; if not, fall back to the chunked path. This
naturally accounts for attributes, topic, framing, and (when used) the compressed payload all
together.

- Inline applies to `sendText` and `sendBytes` (not `sendFile`, not incremental writers), and only
  when all recipients are v2 (and, for `sendText`, there are no attachments).
- The receiver detects an inline stream by the presence of `inlineContent` on the header. It
  synthesizes an already-complete stream from those bytes (decompressing first if `compression` is
  `DEFLATE_RAW`) and never waits for chunk/trailer packets.

---

## Part 5: Compression

Compression is **deflate-raw** (raw DEFLATE, no zlib/gzip wrapper). It is applied only by the finite
send APIs (`sendText`/`sendBytes`/`sendFile`), where the full payload is known up front. Two forms:

### Inline payload compression (single packet)

One-shot deflate-raw of the full payload, written as raw bytes into `inlineContent`, flagged
`compression = DEFLATE_RAW`. **Kept only if it actually shrinks** the payload (deflate framing can
make tiny payloads larger). For uncompressed inline (text or byte), `inlineContent` holds the raw
payload bytes with `compression = NONE`; because `inlineContent` is a binary field there is no base64
round-trip.

### Chunked stream compression (multi packet)

The full payload is compressed as a **single deflate-raw stream whose bytes are spread across the
chunk contents in `chunkIndex` order**, terminated by the DEFLATE final block before the trailer.
The header is flagged `compression = DEFLATE_RAW` and carries `totalLength` = the **pre-compression**
(decompressed) byte length. Chunk packets carry **no** compression metadata.

### Receiver decompression

The receiver detects `compression = DEFLATE_RAW` on the header and feeds all chunk contents (in
`chunkIndex` order) through **one** deflate-raw decompressor for the whole stream, emitting
decompressed content as it is produced. Because the decompressor is stateful and order-sensitive:

- **Duplicate** chunk indices (index ≤ last processed) are dropped with a warning (reliable delivery
  is expected, but reconnect logic may replay).
- A **gap** in chunk indices is a hard error (the stream cannot continue decompressing).

The receiver counts **decompressed** bytes against the header's `totalLength`. For text, decompressed
bytes are re-framed on UTF-8 character boundaries so each delivered piece decodes independently.

If the receiver has no deflate-raw decompressor (no platform `DecompressionStream`), an incoming
compressed stream is **ignored** — the topic handler is never invoked. A conforming receiver only
advertises `CAP_COMPRESSION_DEFLATE_RAW` when it can decompress, so a conforming sender never sends
it a compressed stream; the drop is a defensive backstop against a non-conforming peer.

### Forward-compatibility note (context takeover)

The receive path is deliberately more general than the current send path: a deflate-raw stream that
is sync-flushed at write boundaries (permessage-deflate "context takeover") also decodes
incrementally through the same single-decompressor path. This means a future incremental sender
(compressed `streamText`/`streamBytes`) could be introduced **without a `clientProtocol` bump** —
existing v2 receivers already decode that wire format.

### Eligibility recap

Compression is used iff `compress` is requested (default true) AND the local runtime provides a
deflate-raw compressor AND every recipient advertises `clientProtocol >= 2` AND every recipient
advertises the `CAP_COMPRESSION_DEFLATE_RAW` capability. Otherwise the stream is sent uncompressed.
A pre-v2 recipient — or a v2 recipient that does not advertise the capability — therefore always
receives uncompressed, multi-packet streams (it still receives inline single-packet sends, which
are gated on `clientProtocol` alone).

---

## Part 6: Header size limit (MTU)

A `DataStream.Header` is a single `DataPacket`; one larger than the MTU cannot be reliably sent, and
unbounded `attributes` are both a correctness hazard and a DoS vector. Therefore:

**When sending any stream header on the chunked path, the SDK serializes the header packet and, if
its byte length exceeds `STREAM_CHUNK_SIZE_BYTES`, throws an error (`HeaderTooLarge`) instead of
emitting the packet.** This bounds attributes + topic + framing together against the MTU.

- This is a **breaking change**: previously oversized attributes were accepted; they now error.
- The **inline** path keeps its existing graceful behavior — if the inline header exceeds the
  budget it falls back to the chunked path (no throw); the chunked header send is what enforces the
  hard limit. So a large *payload* with small attributes falls back and sends fine, while large
  *attributes* (whose chunked header still exceeds the MTU) throw.
- Enforcement is **send-side only**. Receivers are not required to reject oversized incoming headers
  (interop with other/older SDKs).

### Constants

| Constant | Value | Meaning |
|----------|-------|---------|
| `STREAM_CHUNK_SIZE_BYTES` | `15000` | Max chunk content size AND the header-packet MTU budget. Kept below the ~16 KB data-channel MTU for protocol/E2EE framing headroom. |

---

## Part 7: Receive-side semantics

1. **Header** → look up the topic handler (text or byte). If none, ignore the stream. Otherwise
   build the stream `info` (stripping reserved attributes), detect inline / compression, create the
   reader, register it by `streamId`, and invoke the handler with the reader + sender identity.
   Reject a duplicate `streamId` whose stream is already open.
2. **Chunk** → route by `streamId` to the open stream; enforce consistent `encryptionType`; deliver
   content (through the decompressor for compressed streams). Empty chunks are ignored.
3. **Trailer** → merge `trailer.attributes` into the stream `info`, then close the reader. Drop the
   stream's registration.
4. **Length validation** → the reader compares received content bytes against the header's
   `totalLength` (when present): short ⇒ "incomplete" error at close; over ⇒ "length exceeded"
   error.
5. **Abnormal end** → if a sending participant disconnects while it has streams in flight to this
   receiver, those open readers are errored ("abnormal end").
6. **Text updates** → a later chunk at an existing `chunkIndex` with a higher `version` supersedes
   the earlier one (used with `TextHeader.operationType = UPDATE`).
7. **Connection gating** → packets received before the receiver is marked connected are buffered and
   replayed in order once it connects (streams can begin arriving during the join handshake).
8. **Unsupported compression** → a compressed stream is ignored (its handler is never invoked) when
   the receiver has no deflate-raw decompressor (see Part 5).

---

## Recommended naming

In the reference implementation:

- The entity that builds and sends streams is `OutgoingDataStreamManager`.
- The entity that receives, routes, and exposes streams to handlers is `IncomingDataStreamManager`.
- Client-protocol constants: `CLIENT_PROTOCOL_DEFAULT` (0), `CLIENT_PROTOCOL_DATA_STREAM_RPC` (1),
  `CLIENT_PROTOCOL_DATA_STREAM_V2` (2).
- Capability constant: `CAP_COMPRESSION_DEFLATE_RAW` (2), stored on each remote participant and
  exposed via a `getRemoteParticipantCapabilities(identity)` accessor the send path consults.
- V2 header fields: `inlineContent` (bytes), `compression` (`DataStream.CompressionType`: `NONE` /
  `DEFLATE_RAW`).
- Chunk/header budget constant: `STREAM_CHUNK_SIZE_BYTES` (15000).

Use these names unless prior SDK architecture makes it burdensome; if you diverge, explain the
rationale and confirm with the user before continuing. The header fields (`inlineContent`,
`compression`), topics, protobuf field names, `clientProtocol` values, the
`CAP_COMPRESSION_DEFLATE_RAW` capability value, and the `STREAM_CHUNK_SIZE_BYTES` budget are **wire
contract** and must match exactly for cross-SDK interop.

---

## Minimum required test cases

The two managers are independently testable and a conforming implementation must pass both sets:

- The **`OutgoingDataStreamManager`** is exercised by calling the send APIs against a captured-packet
  engine and a configurable set of remote participants (each with a `clientProtocol` and a capability
  set), then asserting on the emitted packets (which case, header attributes, chunk contents/indices,
  trailer). Recipient scenarios: a room of all pre-v2 participants, a room of all v2 participants
  (one of which advertises **no** compression capability), and a mixed room.
- The **`IncomingDataStreamManager`** is exercised by registering a topic handler, marking the
  manager connected, feeding hand-crafted packets, and asserting on what the reader yields or the
  error it raises.

### `OutgoingDataStreamManager` (send side)

**Test harness.** Construct the manager with an engine that pushes every `sendDataPacket(packet)`
into a `sentPackets` array, plus a configurable map of remote participants → `(clientProtocol,
capabilities)`. Call a send API, then assert on `sentPackets`: each packet's `value.case`
(`streamHeader` / `streamChunk` / `streamTrailer`), the header's `contentHeader.case`
(`textHeader` / `byteHeader`) and `attributes`, each chunk's `chunkIndex` and `content`, and the
trailer's `streamId`. Three participant rooms are used:

- **all pre-v2** — `alice`, `bob` at `clientProtocol 0`, `jim` at `1` (RPC).
- **all v2** — `alice`, `bob` at `clientProtocol 2` with `CAP_COMPRESSION_DEFLATE_RAW`; `noCompression`
  at `clientProtocol 2` with **no** capabilities.
- **mixed** — `alice` (0), `bob`/`jim` (2 + cap), `mallory` (1), `noCompression` (2, no cap).

The `sendFile` cases below apply only to SDKs that implement the optional `sendFile` API (see Part 3);
omit them on platforms without a native streamable file type.

#### Sending to a room where every recipient is pre-v2

1. **Short text → legacy multi-packet, uncompressed**
   - Call `sendText('hello world', { topic })` (broadcast; all recipients pre-v2).
   - Expect exactly **3** packets.
   - Packet 0 is a `streamHeader` with `contentHeader.case === 'textHeader'`, `streamId === info.id`,
     and the given `topic`.
   - Packet 1 is a `streamChunk` with `chunkIndex 0` and `content` equal to the raw UTF-8 of
     `'hello world'`.
   - Packet 2 is a `streamTrailer` with the matching `streamId` and empty `reason`.
   - The header's `compression` is `NONE` and `inlineContent` is absent.

2. **Short bytes → legacy multi-packet, uncompressed**
   - Open `streamBytes({ topic })`, `write([0x00,0x01,0x02,0x03])`, `close()`.
   - Expect **3** packets: a `byteHeader`, one `streamChunk` (`chunkIndex 0`, `content` equal to the
     four raw bytes), and a trailer.

3. **Long text → uncompressed multi-packet**
   - Call `sendText('A'.repeat(40_000), { topic })`.
   - Expect **5** packets: header + 3 chunks + trailer. Chunk indices are `0,1,2` (contiguous), each
     `content` is all `'A'`, and chunks are split at `STREAM_CHUNK_SIZE_BYTES` (15000, 15000, 10000).
   - The header's `compression` is `NONE`.

4. **Long bytes → uncompressed multi-packet**
   - Open `streamBytes({ topic })`, write a 20 000-byte buffer of `0x01` twice, `close()`.
   - Expect **6** packets: header + 4 chunks + trailer. Each write produces a 15 000-byte chunk then
     a 5 000-byte chunk; chunk indices are `0,1,2,3` (contiguous across writes); content is all `0x01`.

5. **File → uncompressed multi-packet**
   - Call `sendFile(new File([Uint8Array(20_000).fill(0x07)], 'text.txt'), { topic })`.
   - Expect **4** packets: a `byteHeader` with `compression = NONE`, a 15 000-byte chunk
     (`chunkIndex 0`), a 5 000-byte chunk (`chunkIndex 1`), and a trailer; chunk content is raw `0x07`.

#### Sending to a room where every recipient is v2

6. **Short compressible text → single inline packet, compressed**
   - Call `sendText('hello hello compressible world', { topic, destinationIdentities: ['alice','bob'] })`.
   - Expect exactly **1** packet: a `streamHeader` (`textHeader`).
   - `compression === DEFLATE_RAW`; `inlineContent` is a `Uint8Array` and is **not** the raw UTF-8
     of the text (it is the compressed bytes).
   - No `streamChunk` or `streamTrailer` packets.

7. **Short incompressible text → single inline packet, raw**
   - Call `sendText('short', { ..., destinationIdentities: ['alice','bob'] })`.
   - Expect **1** packet. `compression` is `NONE` and `inlineContent` equals the raw UTF-8 of
     `'short'` — deflate didn't shrink it, so the raw bytes are kept (compression is only applied
     when it actually reduces size).

8. **Short text to a recipient lacking the compression capability → single inline packet, raw**
   - Call `sendText('hello hello compressible world', { ..., destinationIdentities: ['noCompression'] })`.
   - Expect **1** packet. `compression` is `NONE`; `inlineContent` equals the raw UTF-8 of the text.
     Inline still happens (gated on `clientProtocol`); compression does not (gated on the capability).

9. **Large highly-compressible text → single inline packet, compressed**
   - Call `sendText('hello world'.repeat(20_000), { ..., destinationIdentities: ['alice','bob'] })`.
   - Expect **1** packet. `compression === DEFLATE_RAW`; `inlineContent` is compressed bytes (does
     **not** start with the UTF-8 of `'hello world'`). It compresses well under the MTU, so it still
     goes inline.

10. **Large somewhat-compressible text → compressed multi-packet**
    - Build a ~50 KB payload of 50 × (`'hello world'` + 1 000 random chars) and `sendText` it to
      `['alice','bob']`.
    - Expect **5** packets: header (`compression = DEFLATE_RAW`) + **3** chunks + trailer — fewer
      than the `ceil(50_000 / 15_000) = 4` chunks an uncompressed send would need. The first chunk's
      `content` length is 15 000 (MTU).

11. **Large incompressible file → compressed multi-packet**
    - Call `sendFile(new File([50_000 random bytes], 'text.txt'), { ..., destinationIdentities: ['alice','bob'] })`.
    - Expect **6** packets: a `byteHeader` (`compression = DEFLATE_RAW`) + **4** chunks (first is
      15 000 bytes) + trailer.
    - The summed chunk content length is **greater** than 50 000 — deflate adds slight overhead on
      incompressible data, the accepted trade-off for streaming the file instead of buffering it.

12. **`compress: false`, short payload → single inline packet, raw**
    - Call `sendText('hello hello compressible world', { ..., destinationIdentities: ['alice','bob'], compress: false })`.
    - Expect **1** packet. `compression` is `NONE`; `inlineContent` equals the raw UTF-8 of the text
      (inline still applies; the opt-out only disables compression).

13. **`compress: false`, large payload → uncompressed multi-packet**
    - `sendText` the same ~50 KB somewhat-compressible payload to `['alice','bob']` with `compress: false`.
    - Expect **6** packets: header (`compression = NONE`) + **4** chunks (first is 15 000 bytes) +
      trailer (uncompressed → `ceil(50_000 / 15_000) = 4` chunks).

14. **`streamText` never compresses or inlines**
    - Open `streamText({ topic, destinationIdentities: ['noCompression'] })`; after open, expect **1**
      packet — a `textHeader` with `compression = NONE`.
    - `write('hello world')` → expect **2** packets total; the new `streamChunk` content equals the
      raw UTF-8 of `'hello world'`.
    - `close()` → expect **3** packets total; the last is a `streamTrailer`.

15. **`streamBytes` never compresses or inlines**
    - Open `streamBytes({ topic, destinationIdentities: ['noCompression'] })`; expect **1** packet — a
      `byteHeader` with `compression = NONE`.
    - `write([0x00,0x01,0x02,0x03])` → expect **2** packets; the chunk content equals the raw bytes.
    - `close()` → expect **3** packets; the last is a trailer.

16. **`sendFile` never sends a single inline packet**
    - Call `sendFile(new File([Uint8Array(10_000).fill(0x01)], 'text.txt'), { ..., destinationIdentities: ['alice','bob'] })`
      (highly compressible).
    - Expect **3** packets (header + 1 chunk + trailer), **not** 1. The header is a `byteHeader` with
      `compression = DEFLATE_RAW`; the chunk `content` length is **less** than 10 000 (compressed).
      `sendFile` never uses the inline path regardless of how small/compressible the file is.

17. **File to a recipient lacking the compression capability → uncompressed multi-packet**
    - Call `sendFile(new File([Uint8Array(10_000).fill(0x07)], 'text.txt'), { ..., destinationIdentities: ['noCompression'] })`.
    - Expect **3** packets: a `byteHeader` with `compression = NONE` and **no** `inlineContent`,
      one 10 000-byte chunk (`chunkIndex 0`, all `0x07`, uncompressed, under the MTU), and a trailer.

18. **Empty file**
    - Call `sendFile(new File([], 'empty.bin'), { ..., destinationIdentities: ['alice','bob'] })`.
    - Packet 0 is a `byteHeader` with `totalLength === 0` and `compression = DEFLATE_RAW`.
    - The last packet is a `streamTrailer` with the matching `streamId`. (A well-formed stream is
      still produced — the deflate stream's final block plus the trailer.)

#### Sending to a mixed room (some pre-v2, some v2)

19. **Broadcast falls back to legacy**
    - Call `sendText('hello world', { topic })` (broadcast) in the mixed room (contains pre-v2
      participants).
    - Expect **3** packets: `textHeader` + chunk (`content` = raw `'hello world'`) + trailer. No
      `inlineContent`; `compression = NONE`.

20. **Targeted send to an all-v2, all-capable subset → single inline packet, compressed**
    - Call `sendText('hello hello compressible world', { ..., destinationIdentities: ['bob','jim'] })`
      (both v2 + capability).
    - Expect **1** packet with `compression = DEFLATE_RAW` and `inlineContent` being compressed bytes
      (not the raw text). Restricting the send to capable recipients re-enables inline + compression.

21. **Targeted send to a subset where one lacks the capability → inline, uncompressed**
    - Call `sendText('hello hello compressible world', { ..., destinationIdentities: ['bob','jim','noCompression'] })`.
    - Expect **1** packet. `compression` is `NONE`; `inlineContent` equals the raw UTF-8 of the text —
      inline still happens (all three are v2) but compression is gated off by `noCompression`.

#### `sendBytes` (in-memory byte payloads)

`sendBytes` mirrors `sendText`'s inline + compression behavior on a `byteHeader`. Every emitted
header has `contentHeader.case === 'byteHeader'`, and the returned `info` defaults `name` to
`'unknown'` and `mimeType` to `'application/octet-stream'` (and threads `topic`/`attributes`/`size`).

22. **Short compressible bytes → single inline packet, compressed** (all-v2 room)
    - Call `sendBytes(utf8('hello hello compressible world'), { topic, attributes: { foo: 'bar' }, destinationIdentities: ['alice','bob'] })`.
    - Expect **1** packet: a `byteHeader` with `compression === DEFLATE_RAW`; `inlineContent` is a
      `Uint8Array` that is **not** the raw payload. `info.name === 'unknown'`,
      `info.mimeType === 'application/octet-stream'`, `info.size === payload.byteLength`,
      `info.attributes === { foo: 'bar' }`.

23. **Short incompressible bytes → single inline packet, raw** (all-v2 room)
    - Call `sendBytes([0x00,0x01,0x02,0x03], { ..., destinationIdentities: ['alice','bob'] })`.
    - Expect **1** packet. `compression` is `NONE`; `inlineContent` equals the four raw bytes.

24. **Bytes to a recipient lacking the compression capability → single inline packet, raw**
    - Call `sendBytes(utf8('hello hello compressible world'), { ..., destinationIdentities: ['noCompression'] })`.
    - Expect **1** packet. `compression` is `NONE`; `inlineContent` equals the raw payload (inline is
      gated on `clientProtocol`; compression on the capability).

25. **Large highly-compressible bytes → single inline packet, compressed** (all-v2 room)
    - Call `sendBytes(Uint8Array(50_000).fill(0x01), { ..., destinationIdentities: ['alice','bob'] })`.
    - Expect **1** packet. `compression === DEFLATE_RAW`; `inlineContent` byte length is **less** than
      50 000 (compresses well under the MTU, so it still goes inline).

26. **Large somewhat-compressible bytes → compressed multi-packet** (all-v2 room)
    - `sendBytes` a ~50 KB payload of 50 × (`'hello world'` + 1 000 random chars) (UTF-8 encoded) to
      `['alice','bob']`.
    - Expect **5** packets: `byteHeader` (`compression = DEFLATE_RAW`, **no** `inlineContent`) + **3**
      chunks (first is 15 000 bytes) + trailer.

27. **`compress: false`, large bytes → uncompressed multi-packet** (all-v2 room)
    - Call `sendBytes(Uint8Array(40_000).fill(0x07), { ..., destinationIdentities: ['alice','bob'], compress: false })`.
    - Expect **5** packets: `byteHeader` (`compression = NONE`, no `inlineContent`) + **3** chunks
      (15 000, 15 000, 10 000; all `0x07`) + trailer.

28. **Bytes to a pre-v2 room → legacy uncompressed multi-packet**
    - Call `sendBytes([0x00,0x01,0x02,0x03], { topic })` with only pre-v2 recipients.
    - Expect **3** packets: `byteHeader` (`compression = NONE`, no `inlineContent`) + one chunk
      (`chunkIndex 0`, the four raw bytes) + trailer. Never inline, never compressed.

### `IncomingDataStreamManager` (receive side)

**Test harness.** Construct the manager, register a text or byte stream handler for a topic that
resolves a promise with the delivered `reader`, mark the manager connected (`setConnected(true)`,
except where buffering is under test), then feed hand-crafted packets via
`handleDataStreamPacket(packet, encryptionType)`. Assertions are on the reader: `await
reader.readAll()` (the full string for text, the array of byte chunks for bytes), `reader.info`
(attributes, `attachedStreamIds`), or the error `readAll()` rejects with. The sending participant
identity is `'alice'` throughout.

#### Receiving v1 (legacy multi-packet) streams

1. **Text stream round-trips**
   - Feed a `textHeader` (`totalLength` = the byte length, `attributes: { foo: 'bar' }`), a chunk
     (`chunkIndex 0`, raw UTF-8), and a trailer (matching `streamId`).
   - `await reader.readAll()` equals the text; `reader.info.attributes.foo === 'bar'`.

2. **Byte stream round-trips**
   - Feed a `byteHeader` (`totalLength 4`, `attributes: { foo: 'bar' }`), a chunk
     (`content [0x01,0x02,0x03,0x04]`), and a trailer.
   - `await reader.readAll()` equals `[Uint8Array([1,2,3,4])]`; `reader.info.attributes.foo === 'bar'`.

3. **Text stream with attachments**
   - Register both a text and a byte handler for the topic.
   - Feed a `textHeader` whose `contentHeader.attachedStreamIds` references an attachment stream id
     (with an inline payload for the text body), then a separate byte stream for that attachment id
     (header + chunk + trailer).
   - Both handlers fire: the text reader yields the body, the byte reader yields the attachment
     bytes, and `textReader.info.attachedStreamIds` has length 1.

4. **Buffers packets received while disconnected**
   - `setConnected(false)`. Feed header + chunk + trailer.
   - Assert the handler has **not** fired yet (the reader promise is still pending).
   - `setConnected(true)`. The handler now fires and `await reader.readAll()` equals the text.

5. **Merges trailer attributes**
   - Feed a header with `attributes: { foo: 'bar', baz: 'quux' }`, a chunk, and a trailer with
     `attributes: { hello: 'world', foo: 'updated' }`.
   - After close, `reader.info.attributes` has `baz === 'quux'` (header), `hello === 'world'`
     (trailer), and `foo === 'updated'` (trailer overrides header).

6. **Drops packets with a mismatched `encryptionType`**
   - Feed the header with `Encryption_Type.NONE`, then feed a chunk with `Encryption_Type.GCM`.
   - `await reader.readAll()` rejects with an `EncryptionTypeMismatch` error ("Encryption type
     mismatch").

7. **Errors when too few bytes arrive**
   - Feed a header declaring `totalLength 5`, a single 1-byte chunk, and a trailer.
   - `await reader.readAll()` rejects with "Not enough chunk(s)" (raised when the stream closes).

8. **Errors when too many bytes arrive**
   - Feed a header declaring `totalLength 3`, then a 5-byte chunk (and a trailer).
   - `await reader.readAll()` rejects with "Extra chunk(s)" (raised as the over-budget chunk is
     processed, before the trailer matters).

9. **Errors on sender disconnect mid-stream**
   - Feed a header declaring `totalLength 10` and a 5-byte chunk (no trailer).
   - Call `manager.validateParticipantHasNoActiveDataStreams('alice')` (the room calls this on
     disconnect).
   - `await reader.readAll()` rejects with "Participant alice unexpectedly disconnected in the middle
     of sending data".

#### Receiving v2 streams

10. **Inline uncompressed text**
    - Feed a single `textHeader` with `inlineContent` = the raw UTF-8 of the text, `attributes:
      { foo: 'bar' }`, and **no** chunk or trailer packets.
    - `await reader.readAll()` equals the text; `reader.info.attributes.foo === 'bar'` (the v2 signals
      were never in `attributes`, so nothing is stripped).

11. **Inline uncompressed byte**
    - Feed a single `byteHeader` (`totalLength 3`) with `inlineContent` = `[0x01,0x02,0x03]` and
      `compression = NONE`.
    - `await reader.readAll()` equals `[Uint8Array([1,2,3])]`.

12. **Inline compressed text**
    - Feed a single `textHeader` (`totalLength` = the *uncompressed* byte length) with `inlineContent`
      = `deflateRaw(text)`, `compression = DEFLATE_RAW`, `attributes: { foo: 'bar' }`.
    - `await reader.readAll()` equals the decompressed text; `reader.info.attributes.foo === 'bar'`.

13. **Inline compressed byte**
    - Feed a single `byteHeader` (`totalLength` = the uncompressed length) with `inlineContent` =
      `deflateRaw(bytes)`, `compression = DEFLATE_RAW`.
    - `await reader.readAll()` equals the original bytes (decompressed).

14. **Multi-packet compressed text**
    - Compress a ~30 KB somewhat-compressible text with one deflate-raw pass (verify the compressed
      output is under `2 × STREAM_CHUNK_SIZE_BYTES`).
    - Feed a `textHeader` (`totalLength` = the uncompressed length, `compression = DEFLATE_RAW`),
      then split the compressed bytes into two chunks at `STREAM_CHUNK_SIZE_BYTES` (`chunkIndex 0` and
      `1`), then a trailer.
    - `await reader.readAll()` equals the original text.

15. **Ignores a compressed stream when no decompressor is available**
    - IMPORTANT NOTE: this test is only relevant if the client relies on platform support for compression /
      decompression. If the client always supports encryption (ie, maybe via a library which is
      always available) this test can be skipped.
    - Temporarily make the platform `CompressionStream`/`DecompressionStream` unavailable.
    - Feed a compressed (`compression = DEFLATE_RAW`) **text** stream (header + chunk + trailer);
      assert the handler is **never** invoked (the reader promise stays pending) — the stream is
      dropped.
    - Repeat with a compressed **byte** stream; same result. Restore the globals afterward.

---

## Benchmarking

Implementing a benchmark is optional but useful for validating correctness and performance under
realistic conditions. Two reference shapes from `client-sdk-js`:

- **Throughput grid** — connect a sender and receiver to one room; for a grid of payload sizes ×
  simulated network conditions, send finite streams for a fixed window and measure
  received-stream throughput, one-way latency percentiles (p50/p95/p99), and integrity
  (checksum) mismatches.
- **Agent-transcription scenario** — model a voice-agent transcript: stream short word-sized writes
  at a realistic cadence (median ~350 ms between writes, occasional bursts) over a long-lived
  `streamText` stream, optionally alongside competing "junk" reliable data packets on the same
  channel, and measure **per-chunk staleness** (receiver-arrival minus sender-write time)
  percentiles plus chunks delivered vs sent. This workload is what established that incremental
  compression is not worthwhile at word granularity.
