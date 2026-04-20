import type { DataPacket } from '@livekit/protocol';

export type EventSendDataPacket = {
  packet: DataPacket;
};

export type RpcServerManagerCallbacks = {
  sendDataPacket: (event: EventSendDataPacket) => void;
};
