import {
  AudioCaptureOptions, AudioPresets, ScreenSharePresets,
  TrackPublishDefaults, VideoCaptureOptions, VideoPresets,
} from './options';

export const publishDefaults: TrackPublishDefaults = {
  audioBitrate: AudioPresets.speech.maxBitrate,
  dtx: true,
  simulcast: true,
  screenShareEncoding: ScreenSharePresets.hd_15.encoding,
  stopMicTrackOnMute: false,
};

export const audioDefaults: AudioCaptureOptions = {
  autoGainControl: true,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
};

export const videoDefaults: VideoCaptureOptions = {
  resolution: VideoPresets.qhd.resolution,
};
