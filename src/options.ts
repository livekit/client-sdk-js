import { LocalTrack } from './room/track/types';

export interface ConnectOptions {
  // default to true, publishes audio track with getUserMedia automatically on connect
  // false to disable this behavior
  audio?: boolean | CreateAudioTrackOptions;

  // default to true, publishes video track with getUserMedia automatically on connect
  // false to disable this behavior
  video?: boolean | CreateVideoTrackOptions;

  // encoding parameters, if not passed in, it'll automatically select an appropriate
  // encoding based on bitrate
  videoEncoding?: VideoEncoding;

  // codec, defaults to vp8
  videoCodec?: VideoCodec;

  // use simulcast, defaults to false
  simulcast?: boolean;

  logLevel?: LogLevel;
  iceServers?: RTCIceServer[];
  // the LocalTracks or MediaStreamTracks to publish after joining
  // these can be obtained by calling createLocalTracks
  // when this is passed in, it'll ignore audio and video options
  tracks?: LocalTrack[] | MediaStreamTrack[];
}

export enum LogLevel {
  trace = 'trace',
  debug = 'debug',
  info = 'info',
  warn = 'warn',
  error = 'error',
  silent = 'silent',
}

export interface CreateLocalTracksOptions {
  audio?: boolean | CreateAudioTrackOptions;
  logLevel?: LogLevel;
  video?: boolean | CreateVideoTrackOptions;
}

export interface CreateLocalTrackOptions {
  logLevel?: LogLevel;

  // name of the track
  name?: string;

  // A ConstrainDOMString object specifying a device ID or an array of device IDs which are acceptable and/or required.
  deviceId?: ConstrainDOMString;
}

export interface CreateVideoTrackOptions extends CreateLocalTrackOptions {
  // a facing or an array of facings which are acceptable and/or required.
  facingMode?: ConstrainDOMString;

  resolution?: VideoResolutionConstraint;
}

export interface CreateAudioTrackOptions extends CreateLocalTrackOptions {
  // specifies whether automatic gain control is preferred and/or required
  autoGainControl?: ConstrainBoolean;

  // the channel count or range of channel counts which are acceptable and/or required
  channelCount?: ConstrainULong;

  // whether or not echo cancellation is preferred and/or required
  echoCancellation?: ConstrainBoolean;

  // the latency or range of latencies which are acceptable and/or required.
  latency?: ConstrainDouble;

  // whether noise suppression is preferred and/or required.
  noiseSuppression?: ConstrainBoolean;

  // the sample rate or range of sample rates which are acceptable and/or required.
  sampleRate?: ConstrainULong;

  // sample size or range of sample sizes which are acceptable and/or required.
  sampleSize?: ConstrainULong;
}

export interface VideoResolutionConstraint {
  width: ConstrainULong;
  height: ConstrainULong;
  frameRate?: ConstrainDouble;
}

export interface VideoEncoding {
  maxBitrate: number;
  maxFramerate: number;
}

export interface VideoPreset {
  resolution: VideoResolutionConstraint;
  encoding: VideoEncoding;
}

export type VideoCodec = 'vp8' | 'h264';

export const VideoPresets: { [key: string]: VideoPreset } = {
  qvga: {
    resolution: {
      width: { ideal: 320 },
      height: { ideal: 180 },
      frameRate: {
        ideal: 15,
        max: 30,
      },
    },
    encoding: {
      maxBitrate: 150_000,
      maxFramerate: 15.0,
    },
  },
  vga: {
    resolution: {
      width: { ideal: 640 },
      height: { ideal: 360 },
      frameRate: {
        ideal: 30,
        max: 60,
      },
    },
    encoding: {
      maxBitrate: 500_000,
      maxFramerate: 30.0,
    },
  },
  qhd: {
    resolution: {
      width: { ideal: 960 },
      height: { ideal: 540 },
      frameRate: {
        ideal: 30,
        max: 60,
      },
    },
    encoding: {
      maxBitrate: 1_200_000,
      maxFramerate: 30.0,
    },
  },
  hd: {
    resolution: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: {
        ideal: 30,
        max: 60,
      },
    },
    encoding: {
      maxBitrate: 2_500_000,
      maxFramerate: 30.0,
    },
  },
  fhd: {
    resolution: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: {
        ideal: 30,
        max: 60,
      },
    },
    encoding: {
      maxBitrate: 4_000_000,
      maxFramerate: 30.0,
    },
  },
};
