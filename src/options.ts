import { LocalTrack } from './room/track/types';

/**
 * if video or audio tracks are created as part of [[connect]], it'll automatically
 * publish those tracks to the room.
 */
export interface ConnectOptions extends CreateLocalTracksOptions {
  /** see [[TrackPublishOptions.videoEncoding]] */
  videoEncoding?: VideoEncoding;

  /** see [[TrackPublishOptions.videoCodec]] */
  videoCodec?: VideoCodec;

  /** see [[TrackPublishOptions.simulcast]] */
  simulcast?: boolean;

  /**
   * configures LiveKit internal log level
   */
  logLevel?: LogLevel;

  /**
   * set ICE servers. LiveKit uses STUN and by default points to Google's public
   * STUN servers
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

export interface VideoPreset {
  resolution: VideoResolutionConstraint;
  encoding: VideoEncoding;
}

export type VideoCodec = 'vp8' | 'h264';

/**
 * Sane presets for video resolution/encoding
 */
export namespace VideoPresets {
  /** 320x180 @ 15fps, 150kbps  */
  export const qvga: VideoPreset = {
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
  };

  /** 640x360 @ 30fps, 500kbps  */
  export const vga: VideoPreset = {
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
  };

  /** 960x540 @ 30fps, 1.2mbps  */
  export const qhd: VideoPreset = {
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
  };

  /** 720p @ 30fps, 2.5mbps  */
  export const hd: VideoPreset = {
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
  };

  /** 1080p @ 30fps, 4mbps  */
  export const fhd: VideoPreset = {
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
  };
}
