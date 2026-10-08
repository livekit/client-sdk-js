import type { InternalRoomConnectOptions, InternalRoomOptions } from '../options';
import DefaultReconnectPolicy from './DefaultReconnectPolicy';
import type { AudioCaptureOptions, TrackPublishDefaults } from './track/options';
import { AudioPresets } from './track/options';

export const defaultVideoCodec = 'vp8';

export const publishDefaults: TrackPublishDefaults = {
  audioPreset: AudioPresets.music,
  dtx: true,
  red: true,
  forceStereo: false,
  stopMicTrackOnMute: false,
  preConnectBuffer: false,
} as const;

export const audioDefaults: AudioCaptureOptions = {
  deviceId: { ideal: 'default' },
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
  voiceIsolation: true,
};

export const roomOptionDefaults: InternalRoomOptions = {
  adaptiveStream: false,
  dynacast: false,
  stopLocalTrackOnUnpublish: true,
  reconnectPolicy: new DefaultReconnectPolicy(),
  disconnectOnPageLeave: true,
  webAudioMix: false,
  singlePeerConnection: true,
} as const;

export const roomConnectOptionDefaults: InternalRoomConnectOptions = {
  autoSubscribe: true,
  disableIceLite: false,
  maxRetries: 1,
  peerConnectionTimeout: 15_000,
  websocketTimeout: 15_000,
} as const;
