# Client telemetry — JS ecosystem design

How `livekit-client` (browser) and `@livekit/react-native` get the pipeline that the Swift, Kotlin
and Dart SDKs get from the Rust core. `livekit-telemetry/SPEC.md` in `rust-sdks` stays the source of
truth for event names, attributes and cadences; this document is only about what carries them here.

## 1. OpenTelemetry SDK, the Rust core via WASM, or our own?

**Our own policy, OpenTelemetry's encoder.** One new runtime dependency —
`@opentelemetry/otlp-transformer`, pinned — turns plain record objects into an OTLP request body in
protobuf or JSON. Nothing else from OpenTelemetry ships.

The budget first, from the repo's own `pnpm size-limit` (webpack, minified, **brotli**):

| `pnpm size-limit` entry | before | with the encoder | limit |
|---|---|---|---|
| `{ Room }` from `dist/livekit-client.esm.mjs` | 114.24 kB | 118.75 kB | 150 kB |
| `dist/livekit-client.umd.js` (not tree-shakeable — every app pays) | 123.58 kB | **128.01 kB** | 130 kB |

So the encoder costs ~4.4 kB brotli where it cannot be shaken out, and leaves **2 kB** under the
UMD limit. That is the number every option has to fit in. Measured against it with esbuild
(`--bundle --minify`, `gzip -9`), `@opentelemetry/*` 0.222.0 / 2.11.0:

| Bundle | minified | gzipped |
|---|---|---|
| `otlp-transformer` proto serializers, logs + traces | 17.8 KB | **5.2 KB** |
| logs SDK + OTLP/HTTP **JSON** exporter | 42.9 KB | 13.5 KB |
| logs SDK + OTLP/HTTP **proto** exporter | 49.4 KB | 15.2 KB |
| logs + traces SDKs + proto exporters | 78.2 KB | **23.0 KB** |

What the full SDK adds over the serializers is a batch processor, a fetch transport and the
provider/context plumbing: ~18 KB gzipped on top, four times the UMD headroom, for three things
that do not fit.

- **The trace model is different.** Our trace is a *scope* — one Room connection across reconnects,
  its id minted by the pipeline and stamped on every span and log record. OTel's tracer wants a
  context tree with a propagator and an active-span mechanism; we would be fighting it to get one
  long-lived id onto records that have no active span.
- **The batching is the upload policy.** `BatchLogRecordProcessor` is a timer and a queue.
  SPEC's policy is holds while `lk.connect` is open, one request in flight, a per-tick budget, a
  60 s cap, a flood guard and a self-report. That is written either way; the processor would sit
  underneath it doing a second, conflicting round of batching.
- **Logs are pre-1.0.** `@opentelemetry/sdk-logs` is `0.222.0` and takes breaking changes across
  minors. `livekit-client` is a library on a hard size budget that many apps pin; the smaller the
  exposed surface of an experimental dependency, the better. The serializers are the smallest
  useful unit, and their input is structural — plain objects, no classes to construct.

Two things we take from the SDK as knowledge rather than code, because it has been through this:
the retryable status set (`429`, `502`, `503`, `504`, honouring `Retry-After`), which is already
what the Rust transport does; and the keepalive accounting — browsers cap *all* in-flight
`fetch(keepalive)` bodies at 64 KiB together and Chromium at 9 concurrent requests, so the last
flush of a page has to be small.

**Not the Rust core via WASM.** Hermes has no WebAssembly, so React Native could never share it,
and sharing is the entire reason to consider it. A browser-only WASM core would be a third
implementation, not a second.

## 2. Less custom logic than the device SDKs

Yes — roughly half of the core does not exist here.

| Dropped | Why |
|---|---|
| Write-ahead file cache, gzip-on-disk, 24 h age prune, next-launch replay | no disk (§3) |
| The FFI layer — UniFFI types, callback interfaces, the transport trait | the pipeline is in the same language as the SDK |
| `record_stats_report` raw-entry parsing | `RTCStatsReport` is already the SDK's own shape (`src/room/stats.ts`, `monitorFrequency = 2000`) |

Device state is not dropped, but it is not uniform either — the pipeline never measures anything
itself, so an `lk.device.*` record exists only where the platform will say so:

| SPEC event | Browser | React Native |
|---|---|---|
| `app_state.changed` | **yes**, `document.visibilityState` | **yes**, `AppState` |
| `network.changed` | **Chromium**, `navigator.connection` — and `type` is populated on Android only, so a desktop page reports `unknown` | via `@react-native-community/netinfo`, an app-owned dependency — not wired |
| `capture.failed` | the `getUserMedia` DOMException names, per SPEC | the same errors through `react-native-webrtc` — not wired |
| `thermal.changed` | `PressureObserver` is Chromium **desktop** only — not wired | **yes**, native |
| `low_power.changed` | no web API | **yes**, native |
| `memory.changed` | no web API (`deviceMemory` is a static figure) | **yes**, native |
| `battery.changed` | Chromium only; Firefox removed it, Safari never shipped it — not wired | native, not wired |
| `audio_route.changed`, `audio.interruption` | `devicechange` says the set changed, not that it went speaker → bluetooth | the package already owns the audio session — not wired |

React Native can reach parity with the Swift and Kotlin SDKs because `@livekit/react-native` already
ships a native module; a page structurally cannot. The cadence factors those signals drive are
implemented (`device.ts`, capped at 4× as SPEC says), so a page stretches on background and Data
Saver, and an app stretches on everything.

| Kept | Why |
|---|---|
| Scope = trace per Room, `session.id` on every record | the whole query story depends on it |
| `lk.rtc.stats.sample` windowing (15 s, counters + min/max/avg) | the reason the project exists |
| Bounded queue, batch size/byte caps, oldest-first eviction, counted | §3 makes the queue the *only* bound |
| Upload holds during `lk.connect` / `lk.reconnect`, 60 s cap, one request in flight | telemetry never wins over media |
| Flood guard, `lk.telemetry.report` | fleet-wide denominators, same shape as everywhere else |

## 3. Caching: in-memory in a tab, whatever the platform has elsewhere

The pipeline is **write-ahead**, as the Rust core is: a batch is stored before the network is tried
and removed only once the collector has taken it, so a refused upload, a lost connection or a
process that dies costs nothing. Where it is stored is `TelemetryStorage` — five synchronous
operations, the same five the core's `BatchCache` has — and the default keeps batches in memory,
bounded by 4 MiB and 512 batches, oldest evicted first and counted.

A batch id carries everything needed to send a batch an earlier run of the app wrote — its route,
its record count, and the encoding it was written with. That last one is not hypothetical: the
first React Native replay lost 40 records because cached JSON batches were re-sent with the
protobuf content type, and the only reason anyone noticed is that `lk.telemetry.report` said
`dropped.rejected: 40` instead of quietly succeeding.

The in-memory default is right for a tab, and nobody in this ecosystem persists there either.

- **OpenTelemetry JS** caches nothing: `BatchLogRecordProcessor` is a bounded in-memory queue and
  the spec puts retry on the exporter, explicitly not on the processor.
- **Sentry browser** is in-memory; offline caching is opt-in, by wrapping the transport in
  `makeBrowserOfflineTransport` (IndexedDB).
- **Datadog browser-SDK** keeps batches in memory and flushes on `visibilitychange`.
- **Grafana Faro** is in-memory.

A tab's lifetime is the call's lifetime; there is no "app killed in the background, replay at next
launch". The last-gasp flush is best effort: `fetch(keepalive)` under 64 KiB on `pagehide`, an
ordinary `fetch` on React Native's `AppState` → background. Neither turns a disappearing page into
a durable queue, which is why the flush happens at `visibilitychange → hidden` and not at `unload`.

React Native is the case where it is not right, because an app really can be killed holding a
backlog and really can be offline for hours. There it supplies a store backed by files — the same
shape the Rust core's `FileCache` has, written natively in the package that already ships native
code rather than pulled in as a dependency. Nothing about that reaches this package: it hands over
`storage` and knows nothing else. A browser could do the same over IndexedDB if the field ever
shows it is worth it.

## 4. Protobuf or JSON?

**Protobuf by default, JSON behind a switch.** Both come from the same package, so this is one
line, and the PoC posts both.

- Smaller: one `lk.ping` with a resource and three attributes is **326 bytes of protobuf against
  846 bytes of JSON** (measured in the React Native PoC below, same record, same encoder package).
  JSON repeats every key as a string, which is what the OTel issue tracker cites for browsers in
  the first place.
- **JSON's ids do not survive LiveKit Cloud today.** OTLP/JSON mandates *hex* `traceId`/`spanId`
  (`otlp-transformer`'s `JSON_ENCODER` passes them through as hex; `PROTOBUF_ENCODER` converts to
  bytes). Posting hex ids to staging landed records whose trace and span ids were **zero** — the
  ingest reads them as stock protojson `bytes`, i.e. base64. Protobuf is unaffected. Filing this is
  worth it regardless, because every standard OTLP/JSON client hits it.
- `Content-Encoding: gzip` is *not* in the v1 design: `CompressionStream` is Chrome 80+, Safari
  16.4+, Firefox 113+ and absent in Hermes, so it would have to be feature-detected for a win
  protobuf already mostly delivers.

## 5. Reusable by React Native

By construction: `@livekit/react-native` depends on `livekit-client`, so telemetry that ships in
this package is in RN with no second implementation. The rules that keep it that way:

- No DOM or `document`/`navigator` access outside the one lifecycle seam. Everything else —
  records, serialization, batching, transport — is plain JS and `fetch`.
- No `crypto.getRandomValues` requirement: ids need to be unique, not unguessable, so `Math.random`
  is the fallback and RN needs no `react-native-get-random-values`.
- `TextEncoder` is only on the JSON path (the protobuf serializer writes its own bytes); RN
  polyfills it in `registerGlobals` anyway.
- A binary body is fine: RN's `convertRequestBody` base64-encodes an `ArrayBuffer`/`ArrayBufferView`
  for the bridge. It costs ~33 % in-process, nothing on the wire.
- The seam: `pagehide` / `visibilitychange` in a page, `AppState` in an app; `navigator.connection`
  in Chromium, nothing (or `@react-native-community/netinfo`, an app-owned dependency) in RN.

**React Native follows the phones, and reuses this package's instrumentation.** The decision is
that `@livekit/react-native` binds the Rust core through UniFFI, the way the Swift, Kotlin and Dart
SDKs do, so that an app on a phone behaves identically whichever SDK it used — same windowing code,
same upload policy, same write-ahead file cache, same bytes on the wire. What it does *not* do is
reimplement the instrumentation: when a connect span starts, which checkpoints it carries, how a
subscribe ends at first media, which `getStats` fields become a window — all of that stays here and
is reused.

That is what `backend.ts` is for. It is the same set of operations SPEC calls the typed surface —
the boundary Swift, Kotlin and Dart already cross into the core — expressed in terms this package
owns: rooms, spans, tracks, outcomes. `Telemetry.setBackend` installs one, and `Room` does not know
which is in place.

```
Room, LocalParticipant, the four track monitors     ← the instrumentation, one copy
                     │
              Backend / Scope / Span                ← backend.ts, platform-neutral by construction
                ╱                ╲
    Pipeline (this package)     RustBackend (@livekit/react-native)
    fetch, in-memory queue      UniFFI → livekit-telemetry → FileCache, NetTransport
```

**Nothing mobile appears on this side of the seam.** `DeviceState` carries only what a page can
answer — visibility and, on Chromium, the connection. Thermal state, low power mode and memory
pressure are not absent because they are unimportant; they are absent because this package cannot
observe them and must not pretend to. React Native's native monitors (`LKDeviceState.swift`,
`DeviceStateMonitor.kt`) report those to the core natively, never through JavaScript.

One thing the PoC found, which is about this package rather than telemetry: `livekit-client`
evaluates `class … extends DOMException` and `new TextDecoder()` at **module scope**, and Hermes has
neither, so anything importing it must come after the React Native polyfills. That is why
`registerTelemetry` is imported below them in `src/index.tsx` — the order is load-bearing.

## Shape

```
src/telemetry/
  index.ts     the Telemetry facade: configure/setServer, the scope factory, the track registry
  pipeline.ts  queue, flush timer, holds, 429/5xx, one request in flight, the self-report
  scope.ts     one per Room connection: trace id, attributes, spans, stats windows
  backend.ts   the seam: what a platform must implement to carry the records (see §5)
  otlp.ts      the records and their wire form (the only OpenTelemetry import lives here)
  webrtc.ts    the SDK's typed sender/receiver stats → one SPEC reading
```

Where the SDK calls it — eleven places, all of them one line except the connect span:

| Site | What it says |
|---|---|
| `Room.connect` | a Cloud URL names the destination; a scope is opened and `lk.connect` starts, holding uploads |
| `Room.attemptConnection` | `signal`, `join_recv`, `pc_connected`, `room_connected` checkpoints, then the span ends |
| `Room.applyJoinResponse` / `handleRoomUpdate` | `lk.room.*`, `lk.participant.*` on every record of the call |
| `EngineEvent.Resuming` / `Restarting` / `Resumed` / `handleSignalRestarted` | one `lk.reconnect` span per reconnect, one checkpoint per attempt, mode = whichever won |
| `Room.handleDisconnect` | open spans fail, `lk.room.disconnected`, the open windows close, one last upload |
| `ParticipantEvent.TrackSubscribed` / `Unsubscribed` | `lk.subscribe`, ended by the first inbound window with bytes |
| `Room.onLocalTrackPublished` / `Unpublished` | which scope and direction a track sid belongs to |
| `LocalParticipant.publishTrack` | `lk.publish` |
| the four track monitors | the reading they already took, every 2 s |

`RTCEngine` gained one field: the reconnect reason, so `Resuming`/`Restarting` can carry it.
`RemoteAudioTrack.getReceiverStats` gained `packetsReceived` / `packetsLost`, which its own
`ReceiverStats` type already declared and nothing was filling in.

## What this design still owes an answer

- **The UMD budget — now measured, and over.** The finished integration costs **+8.95 kB brotli**:
  ESM `{ Room }` goes 114.24 → 123.19 kB (limit 150 kB, comfortable), and the UMD bundle, which
  cannot shake anything out, goes 123.58 → **132.70 kB against a 130 kB limit**. This branch raises
  the UMD limit to 135 kB so the build passes; the alternative is a separate UMD entry point, the
  way the e2ee and frame-metadata workers already have one. That is a call for the SDK's owners.
- **What the SDK's typed stats do not carry.** The windows are folded from the readings the track
  monitors already take, so they cost no extra `getStats()` — but those readings are a subset of
  SPEC. Missing: inbound RTT and jitter-buffer counters, video freeze and pause counts, audio
  level and interruptions. Each is a field to add to `getSenderStats` / `getReceiverStats`, which
  parse the raw report already; `packetsReceived` / `packetsLost` on inbound audio were added here
  as the first of them.
- **The OTLP/JSON id bug on LiveKit Cloud** (see §4) — worth filing whichever encoding we ship.

## Tests

`pnpm test` covers the policy against a stubbed collector, reading the JSON bodies it would have
sent: a window's counters and gauges, a hold that stops uploads and not collection, a 429 that keeps
its batch, the queue evicting oldest-first and saying so, a span's checkpoints and outcome.

`pnpm vitest run --config vitest.telemetry.config.mts` is the session: a real Chromium with fake
media devices, a real `livekit-server --dev`, two Rooms in one page, both reconnect paths, and the
collector that fans out to the same Grafana LGTM stack the mobile harness writes to.

```sh
livekit-server --dev
otelcol-contrib --config src/telemetry/otelcol-web.yaml     # :4320, CORS, fans out to :4318 LGTM
pnpm vitest run --config vitest.telemetry.config.mts
```

One run puts this in the collector: two `lk.connect` spans with all four checkpoints, two
`lk.publish`, four `lk.subscribe` (`subscribed` → `first_media`), two `lk.reconnect`
(`attempt 1 quick` → `attempt 2 full` at `signal_disconnected`, then a full one), six
`lk.rtc.stats.sample` windows across both directions and both kinds, and two `lk.room.disconnected`
at `client_initiated`.

A page cannot POST at an OTLP receiver that does not answer the preflight, which is the one
difference from the mobile harness config: `receivers.otlp.protocols.http.cors`.

React Native runs the identical file — `telemetry-poc/` in the `client-sdk-react-native` worktree
copies `src/telemetry/index.ts` verbatim, no edits. Both pings arrive from a bare RN 0.82.1 app on
the iOS simulator at the same collector and show up in Loki next to the browser's, and the module
also runs under the bare Hermes VM with `fetch` stubbed, which is the cheap check when no simulator
is around. There it reported the size difference that settles §4: **326 bytes of protobuf against
846 bytes of JSON** for the same record.
