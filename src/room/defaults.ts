import { TrackCaptureDefaults, TrackPublishDefaults, VideoPresets } from './track/options';

let publishDefaults: TrackPublishDefaults = {};

let captureDefaults: TrackCaptureDefaults = {
  autoGainControl: true,
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  videoResolution: VideoPresets.qhd.resolution,
};

export function getTrackPublishDefaults(): TrackPublishDefaults {
  return publishDefaults;
}

export function setTrackPublishDefaults(defaults: TrackPublishDefaults) {
  publishDefaults = defaults;
}

export function getTrackCaptureDefaults(): TrackCaptureDefaults {
  return captureDefaults;
}

export function setTrackCaptureDefaults(defaults: TrackCaptureDefaults) {
  captureDefaults = defaults;
}
