import { Room } from '../proto/model';
import {
  CreateRoomRequest,
  DeleteRoomRequest,
  DeleteRoomResponse,
  ListRoomsRequest,
  ListRoomsResponse,
  RoomService,
} from '../proto/room';
import { TwirpRpc } from './TwirpRPC';

interface Rpc {
  request(service: string, method: string, data: any): Promise<string>;
}

const livekitPackage = 'livekit';

export class RoomServiceClientImpl implements RoomService {
  private readonly rpc: Rpc;
  private apiKey: string;
  private secret: string;

  constructor(host: string, apiKey: string, secret: string) {
    this.rpc = new TwirpRpc(host, livekitPackage);
    this.apiKey = apiKey;
    this.secret = secret;
  }

  async CreateRoom(request: CreateRoomRequest): Promise<Room> {
    const data = await this.rpc.request(
      'RoomService',
      'CreateRoom',
      CreateRoomRequest.toJSON(request)
    );
    return Room.fromJSON(data);
  }

  async ListRooms(request: ListRoomsRequest): Promise<ListRoomsResponse> {
    const data = await this.rpc.request(
      'RoomService',
      'ListRooms',
      ListRoomsRequest.toJSON(request)
    );
    return ListRoomsResponse.fromJSON(data);
  }

  async DeleteRoom(request: DeleteRoomRequest): Promise<DeleteRoomResponse> {
    const data = await this.rpc.request(
      'RoomService',
      'DeleteRoom',
      DeleteRoomRequest.toJSON(request)
    );
    return DeleteRoomResponse.fromJSON(data);
  }
}
