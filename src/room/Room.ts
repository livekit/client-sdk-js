import { type E2eeRoomApi, e2ee } from '../e2ee/extension';
import { frameMetadata } from '../frameMetadata/extension';
import { CoreRoom } from './CoreRoom';
import {
  type DataStreamLocalApi,
  type DataStreamRoomApi,
  dataStreams,
} from './data-stream/extension';
import { type DataTrackLocalApi, dataTracks } from './data-track/extension';
import { type RpcLocalApi, type RpcRoomApi, rpc } from './rpc/extension';

export { ConnectionState, type RoomEventCallbacks } from './CoreRoom';

/**
 * In LiveKit, a room is the logical grouping for a list of participants.
 * Participants in a room can publish tracks, and subscribe to others' tracks.
 *
 * a Room fires [[RoomEvent | RoomEvents]].
 *
 * This is the full-featured room: {@link CoreRoom} with every extension installed.
 */
export class Room extends CoreRoom.with(dataStreams, rpc, dataTracks, frameMetadata, e2ee) {}

export default Room;

// The full build installs every extension, so `CoreRoom` and `LocalParticipant` carry every
// extension's methods wherever they appear (event callbacks, type guards, processor hooks), not
// only on the `Room` class. The core entry does not load this file, so a light room keeps the
// narrow types.
declare module './CoreRoom' {
  interface CoreRoom extends DataStreamRoomApi, RpcRoomApi, E2eeRoomApi {}
}
declare module './participant/LocalParticipant' {
  interface LocalParticipant extends DataStreamLocalApi, RpcLocalApi, DataTrackLocalApi {}
}
