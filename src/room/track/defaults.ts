import {
  AudioCaptureOptions,
  AudioPresets,
  ScreenSharePresets,
  TrackPublishDefaults,
  VideoCaptureOptions,
  VideoPresets,
} from './options';

export const publishDefaults: TrackPublishDefaults = {
  audioBitrate: AudioPresets.speech.maxBitrate,
  dtx: true,
  simulcast: true,
  screenShareEncoding: ScreenSharePresets.h1080fps15.encoding,
  stopMicTrackOnMute: false,
  videoCodec: 'vp8',
  backupCodec: { codec: 'vp8', encoding: VideoPresets.h540.encoding },
};

export const audioDefaults: AudioCaptureOptions = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
};

export const videoDefaults: VideoCaptureOptions = {
  resolution: VideoPresets.h720.resolution,
};
