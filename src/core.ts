/**
 * The light entry: `CoreRoom` plus the extensions that `CoreRoom.with(...)` installs on demand.
 * The main entry (`livekit-client`) exports `Room`, which is `CoreRoom` with every extension.
 *
 * Differences from the main entry:
 * - `CoreRoom` alone has no data streams, rpc, data tracks, frame metadata, end-to-end
 *   encryption or video publishing. Receiving video works. Add what you need with
 *   `CoreRoom.with(...)`; dependencies install on their own (`rpc` brings `dataStreams`).
 * - `webrtc-adapter` is not imported. Import it yourself if you support browsers that need
 *   its shims.
 * - `createLocalTracks({ video })` needs the `video` extension installed in some room, or a call
 *   to `registerVideoCapture()`.
 * - Import one entry per app. Each entry is a self-contained bundle, so an app that loads both
 *   gets two copies of every class, and `instanceof` across the two fails.
 *
 * `pnpm check:core` makes sure that `CoreRoom` alone bundles no extension module.
 *
 * @experimental
 */
export * from './exports';
export { CoreRoom } from './room/CoreRoom';
export type { ExtensionContext } from './room/extensions';
export { dataStreams } from './room/data-stream/extension';
export { rpc } from './room/rpc/extension';
export { dataTracks } from './room/data-track/extension';
export { frameMetadata } from './frameMetadata/extension';
export { e2ee } from './e2ee/extension';
export { video } from './room/video/extension';
export {
  type SimulatedParticipantsRoomApi,
  simulatedParticipants,
} from './room/simulated-participants/extension';
export { registerVideoCapture } from './room/video/create';
