# LiveKit client SDK (JS) threat model

`livekit-client` is the browser SDK for LiveKit. It runs inside a web
application's page. It connects to a LiveKit server over a WebSocket signal
connection and WebRTC. It exposes room state, media tracks, data packets,
text and byte streams, RPC, and data tracks to the application. It also
implements optional end-to-end encryption (E2EE) for media and data in a Web
Worker.

## Scope and trust boundaries

Audit the hand-written TypeScript under `src/` on `main`. Prioritise:

- `src/e2ee/`: `KeyProvider`, `E2eeManager`, and the worker
  (`worker/e2ee.worker.ts`, `FrameCryptor.ts`, `DataCryptor.ts`,
  `ParticipantKeyHandler.ts`, `naluUtils.ts`, `sifPayload.ts`). This covers key
  import, derivation and ratcheting, frame trailer parsing (IV length and key
  index come from the last two bytes of the frame), and handling of
  server-injected frames (SIF).
- `src/room/RTCEngine.ts` (`handleDataMessage`, `applyUserDataCompat`) and
  `src/room/CoreRoom.ts` (`handleDataPacket` and the signal handlers that
  update participants and tracks).
- `src/room/data-stream/`: header and chunk reassembly, sender and encryption
  checks (`IncomingDataStreamManager.validateStreamPacket`), deflate-raw
  decompression and its output cap (`compression.ts`), and the pre-connect
  `bufferedPackets` queue.
- `src/room/rpc/`: request, ack and response matching, and the
  expected-sender check in `RpcClientManager`.
- `src/room/data-track/`: packet parsing (`packet/`), depacketizer
  reassembly limits, and how incoming data-track packets are attributed to a
  publisher. They arrive as raw bytes with no sender identity, so attribution
  comes from the track handle mapping that signal sets up.
- `src/frameMetadata/`: packet-trailer parsing, and how its output is used
  relative to E2EE decryption.
- `src/api/`: `SignalClient`, `WebSocketStream`, `parseSignalResponse`, and
  connect URL and token handling. `src/room/RegionUrlProvider.ts` sends the
  token as a bearer header to the configured server's host and follows the
  region URLs that host returns. `src/room/token-source/` fetches tokens and
  decodes them without verification.

Out of scope: `examples/`, `smoke-tests/`, `scripts/`, `src/test/`, `*.test.ts`,
and build configuration. Out of scope also: the protobuf types and their
generated (de)serialisers, which come from the `@livekit/protocol` package, and
browser WebRTC and Web Crypto internals. Report a protobuf bug here only when
this SDK's handling of a decoded message causes it.

**Untrusted:** every other participant in the room. That includes agents and
SIP participants. A participant controls:

- the content of data packets, stream headers and chunks, RPC payloads,
  data-track packets, and media frames, including E2EE trailers and packet
  trailers;
- its own name, metadata, and attributes;
- its track names, and the encryption type it declares for its tracks.

The server relays these fields to every client. Network attackers are
untrusted too.

**Trusted, for routing and identity:** the LiveKit server the application
connects to.

- It authenticates each participant's token.
- It stamps `participantIdentity` and `participantSid` on relayed data packets.
  `CoreRoom.handleDataPacket` and the RPC and stream handlers attribute data
  by that outer field.
- It is the source of room, participant, and track state, region URLs,
  refreshed tokens, and the SIF trailer.

**Not trusted with E2EE content:** the server. With E2EE enabled, it must not
learn keys or plaintext media or data.

**Trusted:** the embedding application. That covers the URL and token it
passes to `connect`, its key provider, the keys it sets, and its options.

LiveKit server (`livekit/livekit`) is enrolled separately. Report bugs in the
server's routing or identity stamping there. Report bugs in how this SDK
consumes what the server relays here.

## Security properties

- **Keys stay on the client.** E2EE key material (raw keys, derived keys,
  ratcheted chain keys) is never sent over the signal connection or a data
  channel, and is never logged. It reaches the application only through
  `KeyProvider` callbacks the application registers.
- **Correct decryption.** A frame or data packet is decrypted only with the
  sending participant's key at the indexed slot, or with the shared key in
  shared-key mode. A frame that fails authentication is dropped; it is never
  forwarded as plaintext. Ratcheting after a failure must not replace a
  working key unless the ratcheted key decrypts. On a track marked encrypted,
  frames that skip decryption are limited to empty DTX frames and SIF frames
  whose payload `identifySifPayload` recognises.
- **Sender identity.** Data from one participant must not be attributed to
  another. This covers data packets, streams, RPC, chat, transcriptions, and
  data tracks. Identity fields inside a participant-controlled payload must
  not override the server-stamped sender. Examples are the legacy
  `UserPacket.participantIdentity`, fields inside an encrypted payload, and
  stream or RPC IDs. A stream or RPC exchange started by one sender must not
  accept packets from another.
- **No code execution from participant content.** The SDK never evaluates
  participant-controlled content as script, and never inserts it as HTML.
  The SDK only creates `<audio>`, `<video>` and `<canvas>` elements. Names,
  metadata, attributes, and payloads are passed to the application as data.
- **Robust parsing.** A malformed signal message, data packet, stream chunk,
  RPC message, data-track packet, or media frame must not throw out of the
  receive path, hang the data-processing lock, or grow memory without bound.
  This includes compressed streams and the pre-connect packet buffer.
- **Token handling.** The access token is sent only to the server URL the
  application configured and to the region URLs that server returns. It must
  not appear in logs; `SignalClient` redacts it from logged URLs.

## Severity guidance

- **Critical:** E2EE key material or plaintext reaching the server, another
  participant, or logs. A participant getting script or HTML executed in
  another client through the SDK.
- **High:**
  - A participant getting forged or unencrypted media or data accepted as
    another participant's encrypted content.
  - Decryption with the wrong participant's key.
  - A participant spoofing another participant's identity on data, streams,
    RPC, or data tracks without compromising the server.
  - The token sent to a host other than the configured server or the region
    URLs it returns.
- **Medium:**
  - One crafted packet, chunk, or frame from a participant that crashes,
    hangs, or exhausts memory in another client.
  - A participant permanently breaking decryption of another participant's
    media.
  - Unauthenticated packet-trailer metadata being trusted where the
    application would expect E2EE protection.
- **Low / not a finding:**
  - Behaviour that needs a malicious server, unless it breaks E2EE
    confidentiality or integrity.
  - Applications rendering participant strings unsafely.
  - The configurable 5 GB default cap on decompressed stream output, unless
    the cap itself is bypassed.
  - The token in the WebSocket query string; browsers cannot set headers on
    WebSocket requests.
  - Unverified client-side token decoding, which is used only for expiry and
    caching.
  - Anything that needs control of the embedding application or its key
    provider.

## Testing

The checkout is at `/src`. Dependencies are installed and `dist/` is built. The
unit tests run under vitest with `happy-dom` and mocked WebRTC; they need no
network or browser.

```sh
cd /src
pnpm test
pnpm exec vitest run src/e2ee src/room/data-stream src/room/rpc src/room/data-track src/api
pnpm exec vitest run src/e2ee/worker/FrameCryptor.test.ts
pnpm type:check
```

Not available offline: `pnpm test:e2e` and `smoke-tests/`. They need
Chromium via Playwright, and the e2e suite also needs a Go mock signal server
built from the server repository.

## Reports

State the attacker's required access: another participant in the room (with
which grants), a malicious or compromised server, or a network attacker. Give
the entry point and the demonstrated impact. Provide a minimal reproducer,
preferably a vitest test next to the affected module that feeds the crafted
signal message, data packet, or frame.
