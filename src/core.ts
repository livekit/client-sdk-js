/**
 * The light entry: `CoreRoom` and the extensions that `CoreRoom.with(...)` installs on demand.
 * The main entry (`livekit-client`) exports `Room`, which is `CoreRoom` with every extension.
 *
 * Not published yet. `scripts/check-core-imports.mjs` makes sure that `CoreRoom` alone bundles
 * no extension module.
 *
 * @experimental
 */
export { CoreRoom } from './room/CoreRoom';
export type {
  ExtendedRoom,
  ExtensionContext,
  ExtensionResult,
  RoomExtension,
} from './room/extensions';
export {
  type DataStreamLocalApi,
  type DataStreamRoomApi,
  dataStreams,
} from './room/data-stream/extension';
export { type RpcLocalApi, type RpcRoomApi, rpc } from './room/rpc/extension';
export { type DataTrackLocalApi, dataTracks } from './room/data-track/extension';
export { frameMetadata } from './frameMetadata/extension';
export { type E2eeRoomApi, e2ee } from './e2ee/extension';
export { type VideoLocalApi, video } from './room/video/extension';
