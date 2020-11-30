import { RTCClientImpl } from './api/rtcClient';
import Room from './room/room';

const connect = function (
  host: string,
  roomId: string,
  token: string
): Promise<Room> {
  const client = new RTCClientImpl();
  const room = new Room(client, roomId);

  // connect to room
  return room.connect();
};

export { connect, Room };
