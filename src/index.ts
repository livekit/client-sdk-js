import 'webrtc-adapter';
import type { E2eeRoomApi } from './e2ee/extension';
import type { DataStreamLocalApi, DataStreamRoomApi } from './room/data-stream/extension';
import type { DataTrackLocalApi } from './room/data-track/extension';
import type { RpcLocalApi, RpcRoomApi } from './room/rpc/extension';
import type { VideoLocalApi } from './room/video/extension';

export * from './exports';
export { Room } from './room/Room';
export type { CoreRoom } from './room/CoreRoom';

// The full build installs every extension, so `CoreRoom` and `LocalParticipant` carry every
// extension's methods wherever they appear (event callbacks, type guards, processor hooks), not
// only on the `Room` class. These augmentations live in the main entry on purpose: the core entry
// never loads this file, so a light room keeps the narrow types.
declare module './room/CoreRoom' {
  interface CoreRoom extends DataStreamRoomApi, RpcRoomApi, E2eeRoomApi {}
}
declare module './room/participant/LocalParticipant' {
  interface LocalParticipant
    extends DataStreamLocalApi, RpcLocalApi, DataTrackLocalApi, VideoLocalApi {}
}
