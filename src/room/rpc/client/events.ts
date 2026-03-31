// SPDX-FileCopyrightText: 2026 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import type { DataPacket, DataPacket_Kind } from '@livekit/protocol';

export type EventSendDataPacket = {
  packet: DataPacket;
  kind: DataPacket_Kind;
};

export type RpcClientManagerCallbacks = {
  sendDataPacket: (event: EventSendDataPacket) => void;
};
