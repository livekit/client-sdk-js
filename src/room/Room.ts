import { e2ee } from '../e2ee/extension';
import { frameMetadata } from '../frameMetadata/extension';
import { CoreRoom } from './CoreRoom';
import { dataStreams } from './data-stream/extension';
import { dataTracks } from './data-track/extension';
import { rpc } from './rpc/extension';
import { registerVideoCapture } from './video/create';
import { video } from './video/extension';

export { ConnectionState, type RoomEventCallbacks } from './CoreRoom';

/**
 * In LiveKit, a room is the logical grouping for a list of participants.
 * Participants in a room can publish tracks, and subscribe to others' tracks.
 *
 * a Room fires [[RoomEvent | RoomEvents]].
 *
 * This is the full-featured room: `CoreRoom` with every extension installed.
 */
export class Room
  extends /*#__PURE__*/ CoreRoom.with(dataStreams, rpc, dataTracks, frameMetadata, e2ee, video) {}

export default Room;

// `createLocalTracks({ video })` must work before any Room exists in the full build.
registerVideoCapture();
