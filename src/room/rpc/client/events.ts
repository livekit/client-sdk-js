import type { DataPacket } from '@livekit/protocol';

export type EventSendDataPacket = {
  packet: DataPacket;
};

export type RpcClientManagerCallbacks = {
  sendDataPacket: (event: EventSendDataPacket) => void;
};
