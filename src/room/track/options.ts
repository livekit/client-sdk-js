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
   * use simulcast, defaults to true.
   * When using simulcast, LiveKit will publish up to three versions of the stream
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
  audio?: boolean | AudioCaptureOptions;

  /**
   * video track options, true to create with defaults. false if video shouldn't be created
   * default true
   */
  video?: boolean | VideoCaptureOptions;
}

export interface VideoCaptureOptions {
  /**
   * A ConstrainDOMString object specifying a device ID or an array of device
   * IDs which are acceptable and/or required.
   */
  deviceId?: ConstrainDOMString;

  /**
   * a facing or an array of facings which are acceptable and/or required.
   */
  facingMode?: 'user' | 'environment' | 'left' | 'right';

  resolution?: VideoResolution;
}

export interface ScreenShareCaptureOptions {
  /**
   * true to capture audio shared. browser support for audio capturing in
   * screenshare is limited: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia#browser_compatibility
   */
  audio?: boolean;

  /** capture resolution, defaults to full HD */
  resolution?: VideoResolution;
}

export interface AudioCaptureOptions {
  /**
   * specifies whether automatic gain control is preferred and/or required
   */
  autoGainControl?: ConstrainBoolean;

  /**
   * the channel count or range of channel counts which are acceptable and/or required
   */
  channelCount?: ConstrainULong;

  /**
   * A ConstrainDOMString object specifying a device ID or an array of device
   * IDs which are acceptable and/or required.
   */
  deviceId?: ConstrainDOMString;

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

  constructor(width: number, height: number, maxBitrate: number, maxFramerate?: number) {
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
  qvga: new VideoPreset(320, 180, 120_000, 10),
  vga: new VideoPreset(640, 360, 300_000, 20),
  qhd: new VideoPreset(960, 540, 600_000, 25),
  hd: new VideoPreset(1280, 720, 2_000_000, 30),
  fhd: new VideoPreset(1920, 1080, 3_000_000, 30),
};

/**
 * Four by three presets
 */
export const VideoPresets43 = {
  qvga: new VideoPreset(240, 180, 90_000, 10),
  vga: new VideoPreset(480, 360, 225_000, 20),
  qhd: new VideoPreset(720, 540, 450_000, 25),
  hd: new VideoPreset(960, 720, 1_500_000, 30),
  fhd: new VideoPreset(1440, 1080, 2_800_000, 30),
};

export const ScreenSharePresets = {
  vga: new VideoPreset(640, 360, 200_000, 3),
  hd_8: new VideoPreset(1280, 720, 400_000, 5),
  hd_15: new VideoPreset(1280, 720, 1_000_000, 15),
  fhd_15: new VideoPreset(1920, 1080, 1_500_000, 15),
  fhd_30: new VideoPreset(1920, 1080, 3_000_000, 30),
};
