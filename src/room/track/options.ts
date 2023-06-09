import type { Track } from './Track';

export interface TrackPublishDefaults {
  /**
   * encoding parameters for camera track
   */
  videoEncoding?: VideoEncoding;

  /**
   * @experimental
   */
  backupCodec?: { codec: BackupVideoCodec; encoding: VideoEncoding } | false;

  /**
   * encoding parameters for screen share track
   */
  screenShareEncoding?: VideoEncoding;

  /**
   * codec, defaults to vp8; for svc codecs, auto enable vp8
   * as backup. (TBD)
   */
  videoCodec?: VideoCodec;

  /**
   * max audio bitrate, defaults to [[AudioPresets.music]]
   * @deprecated use `audioPreset` instead
   */
  audioBitrate?: number;

  /**
   * which audio preset should be used for publishing (audio) tracks
   * defaults to [[AudioPresets.music]]
   */
  audioPreset?: AudioPreset;

  /**
   * dtx (Discontinuous Transmission of audio), enabled by default for mono tracks.
   */
  dtx?: boolean;

  /**
   * red (Redundant Audio Data), enabled by default for mono tracks.
   */
  red?: boolean;

  /**
   * stereo audio track. defaults determined by capture channel count.
   */
  forceStereo?: boolean;

  /**
   * use simulcast, defaults to true.
   * When using simulcast, LiveKit will publish up to three versions of the stream
   * at various resolutions.
   */
  simulcast?: boolean;

  /**
   * scalability mode for svc codecs, defaults to 'L3T3'.
   * for svc codecs, simulcast is disabled.
   */
  scalabilityMode?: ScalabilityMode;

  /**
   * Up to two additional simulcast layers to publish in addition to the original
   * Track.
   * When left blank, it defaults to h180, h360.
   * If a SVC codec is used (VP9 or AV1), this field has no effect.
   *
   * To publish three total layers, you would specify:
   * {
   *   videoEncoding: {...}, // encoding of the primary layer
   *   videoSimulcastLayers: [
   *     VideoPresets.h540,
   *     VideoPresets.h216,
   *   ],
   * }
   */
  videoSimulcastLayers?: Array<VideoPreset>;

  /**
   * custom video simulcast layers for screen tracks
   * Note: the layers need to be ordered from lowest to highest quality
   */
  screenShareSimulcastLayers?: Array<VideoPreset>;

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
  audio?: boolean | AudioCaptureOptions;

  /** capture resolution, defaults to full HD */
  resolution?: VideoResolution;

  /** a CaptureController object instance containing methods that can be used to further manipulate the capture session if included. */
  controller?: unknown; // TODO replace type with CaptureController once it lands in TypeScript

  /** specifies whether the browser should allow the user to select the current tab for capture */
  selfBrowserSurface?: 'include' | 'exclude';

  /** specifies whether the browser should display a control to allow the user to dynamically switch the shared tab during screen-sharing. */
  surfaceSwitching?: 'include' | 'exclude';

  /** specifies whether the browser should include the system audio among the possible audio sources offered to the user */
  systemAudio?: 'include' | 'exclude';

  /**
   * Experimental option to control whether the audio playing in a tab will continue to be played out of a user's
   * local speakers when the tab is captured.
   */
  suppressLocalAudioPlayback?: boolean;
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

export interface AudioOutputOptions {
  /**
   * deviceId to output audio
   *
   * Only supported on browsers where `setSinkId` is available
   */
  deviceId?: string;
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
  priority?: RTCPriorityType;
}

export class VideoPreset {
  encoding: VideoEncoding;

  width: number;

  height: number;

  constructor(
    width: number,
    height: number,
    maxBitrate: number,
    maxFramerate?: number,
    priority?: RTCPriorityType,
  ) {
    this.width = width;
    this.height = height;
    this.encoding = {
      maxBitrate,
      maxFramerate,
      priority,
    };
  }

  get resolution(): VideoResolution {
    return {
      width: this.width,
      height: this.height,
      frameRate: this.encoding.maxFramerate,
      aspectRatio: this.width / this.height,
    };
  }
}

export interface AudioPreset {
  maxBitrate: number;
  priority?: RTCPriorityType;
}

const codecs = ['vp8', 'h264', 'vp9', 'av1'] as const;
const backupCodecs = ['vp8', 'h264'] as const;

export type VideoCodec = (typeof codecs)[number];

export type BackupVideoCodec = (typeof backupCodecs)[number];

export function isBackupCodec(codec: string): codec is BackupVideoCodec {
  return !!backupCodecs.find((backup) => backup === codec);
}

export function isCodecEqual(c1: string | undefined, c2: string | undefined): boolean {
  return (
    c1?.toLowerCase().replace(/audio\/|video\//y, '') ===
    c2?.toLowerCase().replace(/audio\/|video\//y, '')
  );
}

/**
 * scalability modes for svc, only supprot l3t3 now.
 */
export type ScalabilityMode = 'L3T3' | 'L3T3_KEY';

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
  export const musicStereo: AudioPreset = {
    maxBitrate: 48_000,
  };
  export const musicHighQuality: AudioPreset = {
    maxBitrate: 64_000,
  };
  export const musicHighQualityStereo: AudioPreset = {
    maxBitrate: 96_000,
  };
}

/**
 * Sane presets for video resolution/encoding
 */
export const VideoPresets = {
  h90: new VideoPreset(160, 90, 60_000, 15),
  h180: new VideoPreset(320, 180, 120_000, 15),
  h216: new VideoPreset(384, 216, 180_000, 15),
  h360: new VideoPreset(640, 360, 300_000, 20),
  h540: new VideoPreset(960, 540, 600_000, 25),
  h720: new VideoPreset(1280, 720, 1_700_000, 30),
  h1080: new VideoPreset(1920, 1080, 3_000_000, 30),
  h1440: new VideoPreset(2560, 1440, 5_000_000, 30),
  h2160: new VideoPreset(3840, 2160, 8_000_000, 30),
} as const;

/**
 * Four by three presets
 */
export const VideoPresets43 = {
  h120: new VideoPreset(160, 120, 80_000, 15),
  h180: new VideoPreset(240, 180, 100_000, 15),
  h240: new VideoPreset(320, 240, 150_000, 15),
  h360: new VideoPreset(480, 360, 225_000, 20),
  h480: new VideoPreset(640, 480, 300_000, 20),
  h540: new VideoPreset(720, 540, 450_000, 25),
  h720: new VideoPreset(960, 720, 1_500_000, 30),
  h1080: new VideoPreset(1440, 1080, 2_500_000, 30),
  h1440: new VideoPreset(1920, 1440, 3_500_000, 30),
} as const;

export const ScreenSharePresets = {
  h360fps3: new VideoPreset(640, 360, 200_000, 3, 'medium'),
  h720fps5: new VideoPreset(1280, 720, 400_000, 5, 'medium'),
  h720fps15: new VideoPreset(1280, 720, 1_000_000, 15, 'medium'),
  h1080fps15: new VideoPreset(1920, 1080, 1_500_000, 15, 'medium'),
  h1080fps30: new VideoPreset(1920, 1080, 3_000_000, 30, 'medium'),
} as const;
