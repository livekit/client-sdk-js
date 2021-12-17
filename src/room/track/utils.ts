import {
  AudioCaptureOptions, CreateLocalTracksOptions,
  VideoCaptureOptions,
} from './options';

export function mergeDefaultOptions(
  options?: CreateLocalTracksOptions,
  audioDefaults?: AudioCaptureOptions,
  videoDefaults?: VideoCaptureOptions,
): CreateLocalTracksOptions {
  const opts: CreateLocalTracksOptions = {
    ...options,
  };
  if (opts.audio === true) opts.audio = {};
  if (opts.video === true) opts.video = {};

  // use defaults
  if (opts.audio) {
    mergeObjectWithoutOverwriting(opts.audio as Record<string, unknown>,
      audioDefaults as Record<string, unknown>);
  }
  if (opts.video) {
    mergeObjectWithoutOverwriting(opts.video as Record<string, unknown>,
      videoDefaults as Record<string, unknown>);
  }
  return opts;
}

function mergeObjectWithoutOverwriting(
  mainObject: Record<string, unknown>,
  objectToMerge: Record<string, unknown>,
): Record<string, unknown> {
  Object.keys(objectToMerge).forEach((key) => {
    if (!mainObject[key]) mainObject[key] = objectToMerge[key];
  });
  return mainObject;
}

export function constraintsForOptions(options: CreateLocalTracksOptions): MediaStreamConstraints {
  const constraints: MediaStreamConstraints = {};

  if (options.video) {
    // default video options
    const videoOptions: MediaTrackConstraints = {};
    if (typeof options.video === 'object') {
      videoOptions.deviceId = options.video.deviceId;
      videoOptions.facingMode = options.video.facingMode;
      if (options.video.resolution) {
        videoOptions.width = options.video.resolution.width;
        videoOptions.height = options.video.resolution.height;
        videoOptions.frameRate = options.video.resolution.frameRate;
      }
    }
    constraints.video = videoOptions;
  } else {
    constraints.video = false;
  }

  if (options.audio) {
    if (typeof options.audio === 'object') {
      constraints.audio = options.audio;
    } else {
      constraints.audio = true;
    }
  } else {
    constraints.audio = false;
  }
  return constraints;
}
