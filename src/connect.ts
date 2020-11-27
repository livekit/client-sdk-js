import { RoomServiceClientImpl } from "./api/roomService";
import Room from "./room";

const connect = function (
  host: string,
  roomId: string,
  token: string
): Promise<Room> {
  const client = new RoomServiceClientImpl(host);
  const room = new Room(client);

  // connect to room
  return room.connect();
};

export { connect };
