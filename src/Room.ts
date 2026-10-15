import { e2ee } from './e2ee/extension';
import { frameMetadata } from './frameMetadata/extension';
import type { RoomOptions } from './options';
import { CoreRoom } from './room/CoreRoom';
import { chat } from './room/chat/extension';
import { dataStreams } from './room/data-stream/extension';
import { dataTracks } from './room/data-track/extension';
import { installExtensions } from './room/extensions';
import { rpc } from './room/rpc/extension';
import { simulatedParticipants } from './room/simulated-participants/extension';
import { registerVideoCapture } from './room/video/create';
import { video } from './room/video/extension';

export { ConnectionState, type RoomEventCallbacks } from './room/CoreRoom';

/** Every extension, listed bare: each one reads its options from `RoomOptions`, as today. */
const fullExtensions = [
  dataStreams,
  rpc,
  dataTracks,
  frameMetadata,
  e2ee,
  video,
  simulatedParticipants,
  chat,
];

/**
 * In LiveKit, a room is the logical grouping for a list of participants.
 * Participants in a room can publish tracks, and subscribe to others' tracks.
 *
 * a Room fires [[RoomEvent | RoomEvents]].
 *
 * This is the full-featured room: `CoreRoom` with every extension installed.
 */
export class Room extends CoreRoom {
  /**
   * Creates a new Room, the primary construct for a LiveKit session.
   * @param options
   */
  constructor(options?: RoomOptions) {
    super(options);
    installExtensions(this, fullExtensions);
  }
}

export default Room;

// `createLocalTracks({ video })` must work before any Room exists in the full build.
registerVideoCapture();
