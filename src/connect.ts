import { ConnectionInfo, RTCClientImpl } from './api/rtcClient';
import Room from './room/room';

const connect = function (
  info: ConnectionInfo,
  roomId: string,
  token: string
): Promise<Room> {
  const client = new RTCClientImpl();
  const room = new Room(client, roomId);

  // connect to room
  return room.connect(info, token);
};

export { connect };
