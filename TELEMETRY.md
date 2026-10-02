# Client telemetry (maintainers)

The contract — events, attributes, cadences, destination and upload policy — is
[`livekit-telemetry/SPEC.md`](https://github.com/livekit/rust-sdks/blob/main/livekit-telemetry/SPEC.md)
in rust-sdks. The Swift, Kotlin and Dart SDKs get it from the Rust core; a browser cannot link
that core, so `src/telemetry/` is the same pipeline in TypeScript, and `@livekit/react-native`
reuses it (it only wires `configureTelemetryHost()`: a file cache, device state, resource names).

| File | Role |
|---|---|
| `index.ts` | installs the pipeline with the first Room; `disableTelemetry()`; the host hook; SDK warn/error capture |
| `scope.ts` | one per Room: trace id, Room attributes, `lk.connect` / `lk.reconnect` / `lk.publish` / `lk.subscribe`, RTC windows, the two app calls |
| `pipeline.ts` | queue → write-ahead cache → one request in flight; projects, tokens, holds, budget, the answer table, the self-report, opt-out |
| `transport.ts` | Cloud URL rules, token claims, answer classification, Retry-After, backoff, the request |
| `otlp.ts` | record shapes and a protobuf writer for the two OTLP export requests |
| `webrtc.ts`, `poller.ts` | one `getStats()` per peer connection → SPEC readings → windows |
| `storage.ts`, `device.ts` | the cache interface and memory store; device state → events, cadence, holds |

Tests: `telemetry.test.ts` (unit, mock fetch) and `telemetry.browser.test.ts` (the whole story in
Chromium against `livekit-server --dev` and a local collector; see the PR for the commands).
