import {
  AudioCaptureOptions, AudioPresets, ScreenSharePresets,
  TrackPublishDefaults, VideoCaptureOptions, VideoPresets,
} from './options';

export const publishDefaults: TrackPublishDefaults = {
  audioBitrate: AudioPresets.speech.maxBitrate,
  dtx: true,
  simulcast: true,
  screenShareEncoding: ScreenSharePresets.h720fps15.encoding,
  stopMicTrackOnMute: false,
  screenShareSimulcastLayers: [
    ScreenSharePresets.h360fps3,
  ],
};

export const audioDefaults: AudioCaptureOptions = {
  autoGainControl: true,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
};

export const videoDefaults: VideoCaptureOptions = {
  resolution: VideoPresets.h540.resolution,
};
