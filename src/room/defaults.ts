import type { InternalRoomConnectOptions, InternalRoomOptions } from '../options';
import DefaultReconnectPolicy from './DefaultReconnectPolicy';

export const defaultRoomOptions: InternalRoomOptions = {
  adaptiveStream: true,
  dynacast: false,
  stopLocalTrackOnUnpublish: false,
  reconnectPolicy: new DefaultReconnectPolicy(),
} as const;

export const defaultRoomConnectOptions: InternalRoomConnectOptions = {
  autoSubscribe: true,
} as const;
