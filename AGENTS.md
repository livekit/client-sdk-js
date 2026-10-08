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

## Room extensions

`Room` (the main export) is `CoreRoom.with(dataStreams, rpc, dataTracks, frameMetadata, e2ee)`.
`CoreRoom` (`src/room/CoreRoom.ts`) holds the signal client, engine, participants, media and
raw data packets. Everything else is a `RoomExtension` (`src/room/extensions.ts`) that
`CoreRoom.with(...)` installs in the constructor. `src/exports.ts` is the export surface both
entries share; `src/index.ts` adds `Room` and the type augmentations, `src/core.ts` adds
`CoreRoom` and the extension objects (`livekit-client/core`, experimental). The core entry is
built per module with dependencies external (`dist/core/`), so a consumer's bundler drops unused
modules whole; the main entry stays one self-contained bundle. `pnpm check:core` fails if
`CoreRoom` alone bundles an extension module, and `pnpm size-limit` tracks both entries.

- An extension is a plain object: `key`, optional `requires` (hard dependencies, installed first,
  deduped by key), and `install(room, ctx)`. It lives in `extension.ts` next to its managers.
- `install` returns `{ room, local, dispose }`. `room` and `local` members are copied onto the
  room and its local participant under the SDK's method names (`sendText`, `registerRpcMethod`).
  Extra members (the managers) are visible to dependents through `ctx.get(extension)`.
- `install`, `dispose` and every hook are synchronous. Async setup starts in `install` and is
  awaited in the extension's own methods.
- Core calls out through `ExtensionContext` hooks only: `onEngineCreated` (the engine is replaced
  after a close, so register engine listeners there), `onDataPacket` (one owner per `DataPacket`
  case), `onDisconnect`, `onParticipantCreated`, `onParticipantUpdates`, `onSyncState`, and the
  E2EE manager slot (`getE2eeManager` / `setE2eeManager` / `onE2eeManagerChanged`). Core owns
  the slot because `RTCEngine` and the publish path read it. Prefer an existing `RoomEvent` over
  a new hook.
- The full entry (`src/room/Room.ts`) augments `CoreRoom` and `LocalParticipant` with the
  extension API interfaces via `declare module`, so the full build keeps its types wherever those
  classes appear. Inside the SDK's own compilation this means core code can call extension
  methods without a type error; `pnpm check:core` is the guard.
- Extension method bodies must be closures over the managers, never `this`-based: they are
  copied onto instances with `Object.defineProperties`.
- `LocalParticipant.openByteStream` is an internal slot the `dataStreams` extension fills; the
  preconnect audio buffer in `publishTrack` sends through it.
- `Room.dispose()` disconnects, runs extension `dispose` in reverse order and removes the
  `devicechange` listener. A disposed room cannot connect again.
- `simulateParticipants` is the `simulatedParticipants` extension (`src/room/simulated-participants/`);
  it uses the internal `CoreRoom.simulateConnected()` and `getOrCreateParticipant()`.
  `simulateScenario` stays in core. The legacy chat packets (`sendChatMessage`,
  `RoomEvent.ChatMessage`) are the `chat` extension (`src/room/chat/`): the full `Room` installs it,
  the core entry does not export it because text streams supersede it.
- Video publishing is the `video` extension (`src/room/video/`). Receiving video stays in core.
  Core keeps type guards (`isLocalVideoTrack`) and instance method calls on video tracks, which
  cost nothing; it must not import `LocalVideoTrack`, `publishUtils` or `facingMode` as values.
  Two slots connect them: `LocalParticipant.videoPublisher` (the publish pipeline for a video
  track: codec, encodings, layers, start bitrate, server codec fallback, screen capture) and
  `setVideoCapture()` in `track/create.ts` (how `createLocalTracks` builds a video track). The
  full entry calls `registerVideoCapture()` at module load so `createLocalTracks({ video })` works
  before any Room exists.

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
