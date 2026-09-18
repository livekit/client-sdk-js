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
| `lk.device.thermal.changed`, `.low_power.changed`, `.battery.changed`, `.memory.changed`, `.audio_route.changed`, `.audio.interruption` | no web or RN API for any of them |
| The cadence factors those signals drive | only `background` (`visibilitychange` / `AppState`) and `constrained` (`navigator.connection.saveData`, Chromium) survive |
| The FFI layer — UniFFI types, callback interfaces, the transport trait | the pipeline is in the same language as the SDK |
| `record_stats_report` raw-entry parsing | `RTCStatsReport` is already the SDK's own shape (`src/room/stats.ts`, `monitorFrequency = 2000`) |

| Kept | Why |
|---|---|
| Scope = trace per Room, `session.id` on every record | the whole query story depends on it |
| `lk.rtc.stats.sample` windowing (15 s, counters + min/max/avg) | the reason the project exists |
| Bounded queue, batch size/byte caps, oldest-first eviction, counted | §3 makes the queue the *only* bound |
| Upload holds during `lk.connect` / `lk.reconnect`, 60 s cap, one request in flight | telemetry never wins over media |
| Flood guard, `lk.telemetry.report` | fleet-wide denominators, same shape as everywhere else |

## 3. Caching: in-memory only

Yes. Nobody in this ecosystem persists, and the reasons for disk on mobile do not exist in a tab.

- **OpenTelemetry JS** caches nothing: `BatchLogRecordProcessor` is a bounded in-memory queue and
  the spec puts retry on the exporter, explicitly not on the processor.
- **Sentry browser** is in-memory; offline caching is opt-in, by wrapping the transport in
  `makeBrowserOfflineTransport` (IndexedDB).
- **Datadog browser-SDK** keeps batches in memory and flushes on `visibilitychange`.
- **Grafana Faro** is in-memory.

A tab's lifetime is the call's lifetime; there is no "app killed in the background, replay at next
launch". The bound is therefore the queue alone (2048 records, oldest evicted and counted as
`lk.telemetry.dropped.queue_full`), and the last-gasp flush is best effort: `fetch(keepalive)` under
64 KiB on `pagehide`, an ordinary `fetch` on RN's `AppState` → background. Neither turns a
disappearing page into a durable queue, which is why the flush happens at
`visibilitychange → hidden` and not at `unload`.

React Native *can* be killed with a backlog, and it does have `AsyncStorage`. Not for v1: it is
async, slow, and a backlog that matters needs the whole cache policy (age, prune, replay budget)
that §2 just deleted. Revisit if the field shows RN sessions losing their tail.

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

## Shape

```
src/telemetry/
  index.ts        pipeline: resource, destination, queue, flush timer, ping   ← the PoC is this file
  scope.ts        one per Room: trace id, room/participant attributes, spans
  stats.ts        getStats readings → lk.rtc.stats.sample windows
  transport.ts    fetch, holds, 429/5xx, Retry-After, one request in flight
  lifecycle.ts    the platform seam (browser events / RN AppState)
```

## What this design still owes an answer

- **The UMD budget.** 2 kB of headroom is not enough for the pipeline that goes on top of the
  encoder (scope, windowing, transport, self-report — call it another 3–5 kB brotli). Either
  `.size-limit.cjs` moves the UMD limit to ~135 kB, or the UMD build gets telemetry behind its own
  entry point the way the e2ee and frame-metadata workers already are. The ESM path, which is what
  bundled apps use, has 31 kB of room and does not care.
- **Where the stats windows come from.** `src/room/stats.ts` already polls at
  `monitorFrequency = 2000` per track; the window folds those readings. Whether the pipeline
  subscribes to the existing monitors or gets its own `getStats()` call is an implementation
  choice with a real CPU cost attached, and it should be the former.
- **The OTLP/JSON id bug on LiveKit Cloud** (see §4) — worth filing whichever encoding we ship.

## Proof of concept

Real Chromium (Playwright), the same collector + Grafana LGTM stack the mobile harness uses, one
`lk.ping` per encoding:

```sh
otelcol-contrib --config src/telemetry/otelcol-web.yaml     # :4320, CORS, fans out to :4318 LGTM
pnpm vitest run --config vitest.telemetry.config.mts
```

A page cannot POST at an OTLP receiver that does not answer the preflight, which is the one
difference from the mobile harness config: `receivers.otlp.protocols.http.cors`.

React Native runs the identical file — `telemetry-poc/` in the `client-sdk-react-native` worktree
copies `src/telemetry/index.ts` verbatim, no edits. Both pings arrive from a bare RN 0.82.1 app on
the iOS simulator at the same collector and show up in Loki next to the browser's, and the module
also runs under the bare Hermes VM with `fetch` stubbed, which is the cheap check when no simulator
is around. There it reported the size difference that settles §4: **326 bytes of protobuf against
846 bytes of JSON** for the same record.
