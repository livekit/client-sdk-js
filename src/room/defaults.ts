import type { InternalRoomConnectOptions, InternalRoomOptions } from '../options';
import DefaultReconnectPolicy from './DefaultReconnectPolicy';
import {
  AudioCaptureOptions,
  AudioPresets,
  ScreenSharePresets,
  TrackPublishDefaults,
  VideoCaptureOptions,
  VideoPresets,
} from './track/options';

export const publishDefaults: TrackPublishDefaults = {
  audioBitrate: AudioPresets.music.maxBitrate,
  dtx: true,
  red: true,
  forceStereo: false,
  simulcast: true,
  screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
  stopMicTrackOnMute: false,
  videoCodec: 'vp8',
  backupCodec: { codec: 'vp8', encoding: VideoPresets.h540.encoding },
} as const;

export const audioDefaults: AudioCaptureOptions = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
};

export const videoDefaults: VideoCaptureOptions = {
  resolution: VideoPresets.h720.resolution,
};

export const roomOptionDefaults: InternalRoomOptions = {
  adaptiveStream: false,
  dynacast: false,
  stopLocalTrackOnUnpublish: true,
  reconnectPolicy: new DefaultReconnectPolicy(),
  expWebAudioMix: false,
} as const;

export const roomConnectOptionDefaults: InternalRoomConnectOptions = {
  autoSubscribe: true,
  peerConnectionTimeout: 15_000,
} as const;
