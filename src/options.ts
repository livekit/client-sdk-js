import LocalTrack from './room/track/LocalTrack';

/**
 * if video or audio tracks are created as part of [[connect]], it'll automatically
 * publish those tracks to the room.
 */
export interface ConnectOptions extends CreateLocalTracksOptions {
  /** see [[TrackPublishOptions.videoEncoding]] */
  videoEncoding?: VideoEncoding;

  /** see [[TrackPublishOptions.videoCodec]] */
  videoCodec?: VideoCodec;

  /** see [[TrackPublishOptions.audioBitrate]] */
  audioBitrate?: number;

  /** see [[TrackPublishOptions.simulcast]] */
  simulcast?: boolean;

  /** autosubscribe to room tracks upon connect, defaults to true */
  autoSubscribe?: boolean;

  /**
   * configures LiveKit internal log level
   */
  logLevel?: LogLevel;

  /**
   * set ICE servers. When deployed correctly, LiveKit automatically uses the built-in TURN servers
   */
  iceServers?: RTCIceServer[];

  /**
   * Tracks to publish to the room after joining. These can be obtained by calling
   * [[createLocalTracks]]. when this is passed in, it'll ignore audio and video options
   */
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
  /**
   * creates audio track with getUserMedia automatically on connect.
   * default false
   */
  audio?: boolean | CreateAudioTrackOptions;

  /**
   * creates video track with getUserMedia automatically on connect.
   * default false
   */
  video?: boolean | CreateVideoTrackOptions;
}

export interface CreateLocalTrackOptions {
  /** name of track */
  name?: string;

  /**
   * A ConstrainDOMString object specifying a device ID or an array of device
   * IDs which are acceptable and/or required.
   */
  deviceId?: ConstrainDOMString;
}

export interface CreateVideoTrackOptions extends CreateLocalTrackOptions {
  /**
   * a facing or an array of facings which are acceptable and/or required.
   * [valid options](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/facingMode)
   */
  facingMode?: ConstrainDOMString;

  resolution?: VideoResolutionConstraint;
}

export interface CreateAudioTrackOptions extends CreateLocalTrackOptions {
  /**
   * specifies whether automatic gain control is preferred and/or required
   */
  autoGainControl?: ConstrainBoolean;

  /**
   * the channel count or range of channel counts which are acceptable and/or required
   */
  channelCount?: ConstrainULong;

  /**
   * whether or not echo cancellation is preferred and/or required
   */
  echoCancellation?: ConstrainBoolean;

  /**
   * the latency or range of latencies which are acceptable and/or required.
   */
  latency?: ConstrainDouble;

  /**
   * whether noise suppression is preferred and/or required.
   */
  noiseSuppression?: ConstrainBoolean;

  /**
   * the sample rate or range of sample rates which are acceptable and/or required.
   */
  sampleRate?: ConstrainULong;

  /**
   * sample size or range of sample sizes which are acceptable and/or required.
   */
  sampleSize?: ConstrainULong;
}

/**
 * example
 *
 * ```typescript
 * {
 *   width: { ideal: 960 },
 *   height: { ideal: 540 },
 *   frameRate: {
 *     ideal: 30,
 *     max: 60,
 *   },
 * }
 * ```
 */
export interface VideoResolutionConstraint {
  width: ConstrainULong;
  height: ConstrainULong;
  frameRate?: ConstrainDouble;
}

export interface VideoEncoding {
  maxBitrate: number;
  maxFramerate: number;
}

export class VideoPreset {
  encoding: VideoEncoding;

  width: number;

  height: number;

  constructor(width: number, height: number, maxBitrate: number, maxFramerate: number) {
    this.width = width;
    this.height = height;
    this.encoding = {
      maxBitrate,
      maxFramerate,
    };
  }

  get resolution(): VideoResolutionConstraint {
    return {
      width: { ideal: this.width },
      height: { ideal: this.height },
      frameRate: {
        ideal: this.encoding.maxFramerate,
      },
    };
  }
}

export interface AudioPreset {
  maxBitrate: number;
}

export type VideoCodec = 'vp8' | 'h264';

export namespace AudioPresets {
  export const telephone: AudioPreset = {
    maxBitrate: 12_000,
  };
  export const speech: AudioPreset = {
    maxBitrate: 20_000,
  };
  export const music: AudioPreset = {
    maxBitrate: 32_000,
  };
}

/**
 * Sane presets for video resolution/encoding
 */
export const VideoPresets = {
  qvga: new VideoPreset(320, 180, 125_000, 15),
  vga: new VideoPreset(640, 360, 400_000, 30),
  qhd: new VideoPreset(960, 540, 800_000, 30),
  hd: new VideoPreset(1280, 720, 2_500_000, 30),
  fhd: new VideoPreset(1920, 1080, 4_000_000, 30),
};

/**
 * Four by three presets
 */
export const VideoPresets43 = {
  qvga: new VideoPreset(240, 180, 100_000, 15),
  vga: new VideoPreset(480, 360, 320_000, 30),
  qhd: new VideoPreset(720, 540, 640_000, 30),
  hd: new VideoPreset(960, 720, 2_000_000, 30),
  fhd: new VideoPreset(1440, 1080, 3_200_000, 30),
};
