import { RoomService } from './proto/room'

class Room {
  client: RoomService

  constructor(client: RoomService) {
    this.client = client
  }

  connect = async (): Promise<Room> => {
    return new Promise<Room>((resolve, reject) => {
      // attempt to get
      // this.client.resolve(this);
    })
  }
}

export default Room
