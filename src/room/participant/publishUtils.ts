import log from '../../logger';
import { TrackInvalidError } from '../errors';
import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalVideoTrack from '../track/LocalVideoTrack';
import { Track } from '../track/Track';
import { ScreenSharePresets, VideoPreset, VideoPresets, VideoPresets43 } from '../track/options';
import type {
  BackupVideoCodec,
  TrackPublishOptions,
  VideoCodec,
  VideoEncoding,
} from '../track/options';
import { getReactNativeOs, isFireFox, isReactNative, isSVCCodec } from '../utils';

/** @internal */
export function mediaTrackToLocalTrack(
  mediaStreamTrack: MediaStreamTrack,
  constraints?: MediaTrackConstraints,
): LocalVideoTrack | LocalAudioTrack {
  switch (mediaStreamTrack.kind) {
    case 'audio':
      return new LocalAudioTrack(mediaStreamTrack, constraints, false);
    case 'video':
      return new LocalVideoTrack(mediaStreamTrack, constraints, false);
    default:
      throw new TrackInvalidError(`unsupported track type: ${mediaStreamTrack.kind}`);
  }
}

/* @internal */
export const presets169 = Object.values(VideoPresets);

/* @internal */
export const presets43 = Object.values(VideoPresets43);

/* @internal */
export const presetsScreenShare = Object.values(ScreenSharePresets);

/* @internal */
export const defaultSimulcastPresets169 = [VideoPresets.h180, VideoPresets.h360];

/* @internal */
export const defaultSimulcastPresets43 = [VideoPresets43.h180, VideoPresets43.h360];

/* @internal */
export const computeDefaultScreenShareSimulcastPresets = (fromPreset: VideoPreset) => {
  const layers = [{ scaleResolutionDownBy: 2, fps: 3 }];
  return layers.map(
    (t) =>
      new VideoPreset(
        Math.floor(fromPreset.width / t.scaleResolutionDownBy),
        Math.floor(fromPreset.height / t.scaleResolutionDownBy),
        Math.max(
          150_000,
          Math.floor(
            fromPreset.encoding.maxBitrate /
              (t.scaleResolutionDownBy ** 2 * ((fromPreset.encoding.maxFramerate ?? 30) / t.fps)),
          ),
        ),
        t.fps,
        fromPreset.encoding.priority,
      ),
  );
};

// /**
//  *
//  * @internal
//  * @experimental
//  */
// const computeDefaultMultiCodecSimulcastEncodings = (width: number, height: number) => {
//   // use vp8 as a default
//   const vp8 = determineAppropriateEncoding(false, width, height);
//   const vp9 = { ...vp8, maxBitrate: vp8.maxBitrate * 0.9 };
//   const h264 = { ...vp8, maxBitrate: vp8.maxBitrate * 1.1 };
//   const av1 = { ...vp8, maxBitrate: vp8.maxBitrate * 0.7 };
//   return {
//     vp8,
//     vp9,
//     h264,
//     av1,
//   };
// };

const videoRids = ['q', 'h', 'f'];

/* @internal */
export function computeVideoEncodings(
  isScreenShare: boolean,
  width?: number,
  height?: number,
  options?: TrackPublishOptions,
): RTCRtpEncodingParameters[] {
  let videoEncoding: VideoEncoding | undefined = options?.videoEncoding;

  if (isScreenShare) {
    videoEncoding = options?.screenShareEncoding;
  }

  const useSimulcast = options?.simulcast;
  const scalabilityMode = options?.scalabilityMode;
  const videoCodec = options?.videoCodec;

  if ((!videoEncoding && !useSimulcast && !scalabilityMode) || !width || !height) {
    // when we aren't simulcasting or svc, will need to return a single encoding without
    // capping bandwidth. we always require a encoding for dynacast
    return [{}];
  }

  if (!videoEncoding) {
    // find the right encoding based on width/height
    videoEncoding = determineAppropriateEncoding(isScreenShare, width, height, videoCodec);
    log.debug('using video encoding', videoEncoding);
  }

  const original = new VideoPreset(
    width,
    height,
    videoEncoding.maxBitrate,
    videoEncoding.maxFramerate,
    videoEncoding.priority,
  );

  if (scalabilityMode && isSVCCodec(videoCodec)) {
    log.debug(`using svc with scalabilityMode ${scalabilityMode}`);

    const sm = new ScalabilityMode(scalabilityMode);

    const encodings: RTCRtpEncodingParameters[] = [];

    if (sm.spatial > 3) {
      throw new Error(`unsupported scalabilityMode: ${scalabilityMode}`);
    }
    for (let i = 0; i < sm.spatial; i += 1) {
      encodings.push({
        rid: videoRids[2 - i],
        maxBitrate: videoEncoding.maxBitrate / 3 ** i,
        /* @ts-ignore */
        maxFramerate: original.encoding.maxFramerate,
      });
    }
    /* @ts-ignore */
    encodings[0].scalabilityMode = scalabilityMode;
    log.debug('encodings', encodings);
    return encodings;
  }

  if (!useSimulcast) {
    return [videoEncoding];
  }

  let presets: Array<VideoPreset> = [];
  if (isScreenShare) {
    presets =
      sortPresets(options?.screenShareSimulcastLayers) ??
      defaultSimulcastLayers(isScreenShare, original);
  } else {
    presets =
      sortPresets(options?.videoSimulcastLayers) ?? defaultSimulcastLayers(isScreenShare, original);
  }
  let midPreset: VideoPreset | undefined;
  if (presets.length > 0) {
    const lowPreset = presets[0];
    if (presets.length > 1) {
      [, midPreset] = presets;
    }

    // NOTE:
    //   1. Ordering of these encodings is important. Chrome seems
    //      to use the index into encodings to decide which layer
    //      to disable when CPU constrained.
    //      So encodings should be ordered in increasing spatial
    //      resolution order.
    //   2. ion-sfu translates rids into layers. So, all encodings
    //      should have the base layer `q` and then more added
    //      based on other conditions.
    const size = Math.max(width, height);
    if (size >= 960 && midPreset) {
      return encodingsFromPresets(width, height, [lowPreset, midPreset, original]);
    }
    if (size >= 480) {
      return encodingsFromPresets(width, height, [lowPreset, original]);
    }
  }
  return encodingsFromPresets(width, height, [original]);
}

export function computeTrackBackupEncodings(
  track: LocalVideoTrack,
  videoCodec: BackupVideoCodec,
  opts: TrackPublishOptions,
) {
  if (!opts.backupCodec || opts.backupCodec.codec === opts.videoCodec) {
    // backup codec publishing is disabled
    return;
  }
  if (videoCodec !== opts.backupCodec.codec) {
    log.warn('requested a different codec than specified as backup', {
      serverRequested: videoCodec,
      backup: opts.backupCodec.codec,
    });
  }

  opts.videoCodec = videoCodec;
  // use backup encoding setting as videoEncoding for backup codec publishing
  opts.videoEncoding = opts.backupCodec.encoding;

  const settings = track.mediaStreamTrack.getSettings();
  const width = settings.width ?? track.dimensions?.width;
  const height = settings.height ?? track.dimensions?.height;

  const encodings = computeVideoEncodings(
    track.source === Track.Source.ScreenShare,
    width,
    height,
    opts,
  );
  return encodings;
}

/* @internal */
export function determineAppropriateEncoding(
  isScreenShare: boolean,
  width: number,
  height: number,
  codec?: VideoCodec,
): VideoEncoding {
  const presets = presetsForResolution(isScreenShare, width, height);
  let { encoding } = presets[0];

  // handle portrait by swapping dimensions
  const size = Math.max(width, height);

  for (let i = 0; i < presets.length; i += 1) {
    const preset = presets[i];
    encoding = preset.encoding;
    if (preset.width >= size) {
      break;
    }
  }
  // presets are based on the assumption of vp8 as a codec
  // for other codecs we adjust the maxBitrate if no specific videoEncoding has been provided
  // TODO make the bitrate multipliers configurable per codec
  if (codec) {
    switch (codec) {
      case 'av1':
        encoding = { ...encoding };
        encoding.maxBitrate = encoding.maxBitrate * 0.7;
        break;
      case 'vp9':
        encoding = { ...encoding };
        encoding.maxBitrate = encoding.maxBitrate * 0.85;
        break;
      default:
        break;
    }
  }

  return encoding;
}

/* @internal */
export function presetsForResolution(
  isScreenShare: boolean,
  width: number,
  height: number,
): VideoPreset[] {
  if (isScreenShare) {
    return presetsScreenShare;
  }
  const aspect = width > height ? width / height : height / width;
  if (Math.abs(aspect - 16.0 / 9) < Math.abs(aspect - 4.0 / 3)) {
    return presets169;
  }
  return presets43;
}

/* @internal */
export function defaultSimulcastLayers(
  isScreenShare: boolean,
  original: VideoPreset,
): VideoPreset[] {
  if (isScreenShare) {
    return computeDefaultScreenShareSimulcastPresets(original);
  }
  const { width, height } = original;
  const aspect = width > height ? width / height : height / width;
  if (Math.abs(aspect - 16.0 / 9) < Math.abs(aspect - 4.0 / 3)) {
    return defaultSimulcastPresets169;
  }
  return defaultSimulcastPresets43;
}

// presets should be ordered by low, medium, high
function encodingsFromPresets(
  width: number,
  height: number,
  presets: VideoPreset[],
): RTCRtpEncodingParameters[] {
  const encodings: RTCRtpEncodingParameters[] = [];
  presets.forEach((preset, idx) => {
    if (idx >= videoRids.length) {
      return;
    }
    const size = Math.min(width, height);
    const rid = videoRids[idx];
    const encoding: RTCRtpEncodingParameters = {
      rid,
      scaleResolutionDownBy: Math.max(1, size / Math.min(preset.width, preset.height)),
      maxBitrate: preset.encoding.maxBitrate,
    };
    if (preset.encoding.maxFramerate) {
      encoding.maxFramerate = preset.encoding.maxFramerate;
    }
    const canSetPriority = isFireFox() || idx === 0;
    if (preset.encoding.priority && canSetPriority) {
      encoding.priority = preset.encoding.priority;
      encoding.networkPriority = preset.encoding.priority;
    }
    encodings.push(encoding);
  });

  // RN ios simulcast requires all same framerates.
  if (isReactNative() && getReactNativeOs() === 'ios') {
    let topFramerate: number | undefined = undefined;
    encodings.forEach((encoding) => {
      if (!topFramerate) {
        topFramerate = encoding.maxFramerate;
      } else if (encoding.maxFramerate && encoding.maxFramerate > topFramerate) {
        topFramerate = encoding.maxFramerate;
      }
    });

    let notifyOnce = true;
    encodings.forEach((encoding) => {
      if (encoding.maxFramerate != topFramerate) {
        if (notifyOnce) {
          notifyOnce = false;
          log.info(
            `Simulcast on iOS React-Native requires all encodings to share the same framerate.`,
          );
        }
        log.info(`Setting framerate of encoding \"${encoding.rid ?? ''}\" to ${topFramerate}`);
        encoding.maxFramerate = topFramerate;
      }
    });
  }

  return encodings;
}

/** @internal */
export function sortPresets(presets: Array<VideoPreset> | undefined) {
  if (!presets) return;
  return presets.sort((a, b) => {
    const { encoding: aEnc } = a;
    const { encoding: bEnc } = b;

    if (aEnc.maxBitrate > bEnc.maxBitrate) {
      return 1;
    }
    if (aEnc.maxBitrate < bEnc.maxBitrate) return -1;
    if (aEnc.maxBitrate === bEnc.maxBitrate && aEnc.maxFramerate && bEnc.maxFramerate) {
      return aEnc.maxFramerate > bEnc.maxFramerate ? 1 : -1;
    }
    return 0;
  });
}

/** @internal */
export class ScalabilityMode {
  spatial: number;

  temporal: number;

  suffix: undefined | 'h' | '_KEY' | '_KEY_SHIFT';

  constructor(scalabilityMode: string) {
    const results = scalabilityMode.match(/^L(\d)T(\d)(h|_KEY|_KEY_SHIFT){0,1}$/);
    if (!results) {
      throw new Error('invalid scalability mode');
    }

    this.spatial = parseInt(results[1]);
    this.temporal = parseInt(results[2]);
    if (results.length > 3) {
      switch (results[3]) {
        case 'h':
        case '_KEY':
        case '_KEY_SHIFT':
          this.suffix = results[3];
      }
    }
  }

  toString(): string {
    return `L${this.spatial}T${this.temporal}${this.suffix ?? ''}`;
  }
}
