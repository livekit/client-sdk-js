> Note for agents: If you discover useful context about this codebase during a conversation —
> architectural patterns, naming conventions, API design decisions, gotchas — please add it
> to this file in the background so future agent interactions benefit from the knowledge.

## Project overview

This is the LiveKit client SDK for JavaScript/TypeScript (`livekit-client`). It provides the
browser-side implementation for connecting to LiveKit rooms and interacting with
audio, video, data streams, data tracks, and RPC.

## Key concepts

### Room and participants

A `Room` is the central object. It connects to a LiveKit server and exposes `localParticipant`
(the current user) and `remoteParticipants` (everyone else). Room events (`RoomEvent.*`) are
the primary way to react to state changes — tracks published, participants joining/leaving, etc.

Important: event handlers should be registered **before** calling `room.connect()` because some
events (like `DataTrackPublished`) fire during the connection handshake.

### Data transport APIs

LiveKit has four data transport mechanisms, each suited to different patterns:

- **Data packets** — one-shot messages, reliable or lossy delivery
- **Text streams / byte streams** — finite reliable streams (chat, file transfer, LLM responses)
- **RPC** — request-response over the room
- **Data tracks** — continuous unreliable streams for real-time data (sensor telemetry, robot
  teleoperation). This is the newest addition.

### Data tracks architecture

Data tracks have a **publish side** (LocalDataTrack) and a **subscribe side** (RemoteDataTrack).
The publish/subscribe lifecycle is managed by `OutgoingDataTrackManager` and
`IncomingDataTrackManager` respectively.

Key design decisions:
- `RemoteDataTrack.subscribe()` is **synchronous** — it returns a `ReadableStream` immediately.
  The SFU subscription is initiated lazily inside the stream's `start` callback.
- The `subscribe()` signal parameter follows the **fetch API pattern**: a single `AbortSignal`
  controls both the pending SFU negotiation phase and the active streaming phase.
- Each subscription has an internal frame buffer. When the buffer fills, new frames are dropped
  (not queued infinitely). Buffer size is configurable via `subscribe({ bufferSize })`.
- `openSubscriptionStream()` on the manager returns a tuple:
  `[ReadableStream, Promise<void>]` where the promise resolves when the SFU subscription is
  fully established. This is primarily useful for tests.

### Data streams (text/byte streams)

Data stream readers (`ByteStreamReader`, `TextStreamReader`) implement async iteration with
abort signal support. They extend a `BaseStreamReader` base class. The `withAbortSignal()`
method on these readers is `@internal` — it exists for `readAll()` but is not meant as
user-facing API.

## Build and test

- **Type check:** `npx tsc --noEmit`
- **Run all tests:** `npx vitest run`
- **Run specific test file:** `npx vitest run path/to/file.test.ts`
- **Format:** `npm run format`

## Examples

Standalone example apps live in `examples/`. Each has its own `package.json`, `vite.config.js`,
and an Express API backend (`api.ts`) for token generation via `vite-plugin-mix`. To run one:

```
cd examples/<name>
pnpm install
pnpm dev
```

The main demo app (`examples/demo/`) is a comprehensive kitchen-sink UI. Standalone examples
(`examples/rpc/`, `examples/data-tracks/`) focus on individual features.

## Manager pattern

Managers (e.g. `RpcClientManager`, `RpcServerManager`, `OutgoingDataTrackManager`,
`IncomingDataTrackManager`) follow a consistent decoupled architecture:

- **No RTCEngine dependency.** Managers never import or hold a reference to `RTCEngine`.
  - Not all managers currently abide by this, but it is a good goal for newly introduced managers
    to follow unless it is overly burdensome.
- **Incoming data** arrives via explicit `handle*` methods (e.g. `handleIncomingRpcAck`,
  `handleIncomingDataStream`). `Room` parses incoming packets and calls these directly.
- **Outgoing data** is emitted via strongly-typed events using `typed-emitter`. Managers extend
  `(EventEmitter as new () => TypedEmitter<ManagerCallbacks>)` and `Room` subscribes to these
  events to forward packets to the engine.
- **External state** (e.g. remote participant protocol version, server version) is injected as
  callbacks in the constructor, not looked up from the engine.
- **Event types** are usually defined in an `events.ts` file alongside each manager.
- **Directory structure** groups each manager with its events and tests:
  `src/room/rpc/client/` contains `RpcClientManager.ts`, `events.ts`, and
  `RpcClientManager.test.ts`.

### Testing managers

- Tests construct managers directly — no mock engine needed.
- Use `subscribeToEvents<ManagerCallbacks>(manager, ['eventName'])` from
  `src/utils/subscribeToEvents.ts` to capture emitted events. Create `managerEvents` per-test
  (not in `beforeEach`) so the subscription list can evolve independently.
- Call `managerEvents.waitFor('eventName')` to get emitted event payloads in order.
- Use `managerEvents.areThereBufferedEvents('eventName')` to assert no unexpected events.
- Prefer plain `async () => { ... }` handlers over `vi.fn().mockResolvedValue()` unless the
  test needs to assert on call arguments.

## Code style notes

- The codebase uses a `@throws-transformer` that converts `throw` statements into typed error
  return types. Panics (programmer errors) are annotated with `// @throws-transformer ignore`.
- `Future<T, E>` is a local utility similar to a deferred promise — it exposes
  `resolve`/`reject` callbacks and a `.promise` property.
- Error classes use a `Reasoned` pattern: `DataTrackSubscribeError<Reason>` with a `reason` enum
  and static factory methods (`.timeout()`, `.cancelled()`, `.disconnected()`).
