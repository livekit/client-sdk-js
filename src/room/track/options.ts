import { Track } from './Track';

export interface TrackPublishDefaults {
  /**
   * encoding parameters for camera track
   */
  videoEncoding?: VideoEncoding;

  /**
   * encoding parameters for screen share track
   */
  screenShareEncoding?: VideoEncoding;

  /**
   * codec, defaults to vp8
   */
  videoCodec?: VideoCodec;

  /**
   * max audio bitrate, defaults to [[AudioPresets.speech]]
   */
  audioBitrate?: number;

  /**
   * dtx (Discontinuous Tranmission of audio), defaults to true
   */
  dtx?: boolean;

  /**
   * use simulcast, defaults to false.
   * When using simulcast, LiveKit will publish up to three version of the stream
   * at various resolutions.
   */
  simulcast?: boolean;

  /**
   * For local tracks, stop the underlying MediaStreamTrack when the track is muted (or paused)
   * on some platforms, this option is necessary to disable the microphone recording indicator.
   * Note: when this is enabled, and BT devices are connected, they will transition between
   * profiles (e.g. HFP to A2DP) and there will be an audible difference in playback.
   *
   * defaults to false
   */
  stopMicTrackOnMute?: boolean;
}

export interface TrackCaptureDefaults {
  /**
   * default device to use for microphone capture
   */
  audioDeviceId?: string;

  /**
   * specifies whether automatic gain control is preferred, defaults to true
   */
  autoGainControl?: boolean;

  /**
   * the channel count or range of channel counts which are acceptable and/or required
   */
  channelCount?: number;

  /**
   * whether or not echo cancellation is preferred, defaults to true
   */
  echoCancellation?: boolean;

  /**
   * whether noise suppression is preferred, defaults to true
   */
  noiseSuppression?: boolean;

  /**
   * set if a particular video facing mode is preferred
   */
  videoFacingMode?: 'user' | 'environment' | 'left' | 'right';

  /**
   * default device to use for camera capture
   */
  videoDeviceId?: string;

  /**
   * default video capture resolution
   */
  videoResolution?: VideoResolution;
}

/**
 * Options when publishing tracks
 */
export interface TrackPublishOptions extends TrackPublishDefaults {
  /**
   * set a track name
   */
  name?: string;

  /**
   * Source of track, camera, microphone, or screen
   */
  source?: Track.Source;
}

export interface CreateLocalTracksOptions {
  /**
   * audio track options, true to create with defaults. false if audio shouldn't be created
   * default true
   */
  audio?: boolean | CreateAudioTrackOptions;

  /**
   * video track options, true to create with defaults. false if video shouldn't be created
   * default true
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

  resolution?: VideoResolution;
}

export interface CreateScreenTrackOptions {
  /** name of track, defaults to "screen" */
  name?: string;

  /**
   * true to capture audio shared. browser support for audio capturing in
   * screenshare is limited: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia#browser_compatibility
   */
  audio?: boolean;

  /** capture resolution, defaults to full HD */
  resolution?: VideoResolution;
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
 *   width: 960,
 *   height: 540,
 *   frameRate: {
 *     ideal: 30,
 *     max: 60,
 *   },
 * }
 * ```
 */

export interface VideoResolution {
  width: number;
  height: number;
  frameRate?: number;
  aspectRatio?: number;
}

export interface VideoEncoding {
  maxBitrate: number;
  maxFramerate?: number;
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

  get resolution(): VideoResolution {
    return {
      width: this.width,
      height: this.height,
      frameRate: this.encoding.maxFramerate,
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

export const ScreenSharePresets = {
  vga: new VideoPreset(640, 360, 200_000, 3),
  hd_8: new VideoPreset(1280, 720, 400_000, 5),
  hd_15: new VideoPreset(1280, 720, 1_250_000, 15),
  fhd_15: new VideoPreset(1920, 1080, 2_000_000, 15),
  fhd_30: new VideoPreset(1920, 1080, 4_000_000, 30),
};
