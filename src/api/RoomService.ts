import { RoomInfo } from '../proto/model';
import {
  CreateRoomRequest,
  DeleteRoomRequest,
  DeleteRoomResponse,
  GetRoomRequest,
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

  CreateRoom(request: CreateRoomRequest): Promise<RoomInfo> {
    const promise = this.rpc.request(
      'RoomService',
      'CreateRoom',
      CreateRoomRequest.toJSON(request)
    );
    return promise.then((data) => RoomInfo.fromJSON(data));
  }

  GetRoom(request: GetRoomRequest): Promise<RoomInfo> {
    const promise = this.rpc.request(
      'RoomService',
      'GetRoom',
      GetRoomRequest.toJSON(request)
    );
    return promise.then((data) => RoomInfo.fromJSON(data));
  }

  DeleteRoom(request: DeleteRoomRequest): Promise<DeleteRoomResponse> {
    const promise = this.rpc.request(
      'RoomService',
      'DeleteRoom',
      DeleteRoomRequest.toJSON(request)
    );
    return promise.then((data) => DeleteRoomResponse.fromJSON(data));
  }
}
