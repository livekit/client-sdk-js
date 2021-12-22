import log from '../../logger';
import { TrackInvalidError } from '../errors';
import LocalAudioTrack from '../track/LocalAudioTrack';
import LocalVideoTrack from '../track/LocalVideoTrack';
import {
  ScreenSharePresets, TrackPublishOptions,
  VideoEncoding, VideoPreset, VideoPresets,
  VideoPresets43,
} from '../track/options';

/** @internal */
export function mediaTrackToLocalTrack(
  mediaStreamTrack: MediaStreamTrack,
  constraints?: MediaTrackConstraints,
): LocalVideoTrack | LocalAudioTrack {
  switch (mediaStreamTrack.kind) {
    case 'audio':
      return new LocalAudioTrack(mediaStreamTrack, constraints);
    case 'video':
      return new LocalVideoTrack(mediaStreamTrack, constraints);
    default:
      throw new TrackInvalidError(
        `unsupported track type: ${mediaStreamTrack.kind}`,
      );
  }
}

/* @internal */
export const presets169 = [
  VideoPresets.qvga,
  VideoPresets.vga,
  VideoPresets.qhd,
  VideoPresets.hd,
  VideoPresets.fhd,
];

/* @internal */
export const presets43 = [
  VideoPresets43.qvga,
  VideoPresets43.vga,
  VideoPresets43.qhd,
  VideoPresets43.hd,
  VideoPresets43.fhd,
];

/* @internal */
export const presetsScreenShare = [
  ScreenSharePresets.vga,
  ScreenSharePresets.hd_8,
  ScreenSharePresets.hd_15,
  ScreenSharePresets.fhd_15,
  ScreenSharePresets.fhd_30,
];

const videoRids = ['q', 'h', 'f'];

/* @internal */
export function computeVideoEncodings(
  isScreenShare: boolean,
  width?: number,
  height?: number,
  options?: TrackPublishOptions,
): RTCRtpEncodingParameters[] | undefined {
  let videoEncoding: VideoEncoding | undefined = options?.videoEncoding;
  if (isScreenShare) {
    videoEncoding = options?.screenShareEncoding;
  }
  const useSimulcast = !isScreenShare && options?.simulcast;

  if ((!videoEncoding && !useSimulcast) || !width || !height) {
    // don't set encoding when we are not simulcasting and user isn't restricting
    // encoding parameters
    return;
  }

  if (!videoEncoding) {
    // find the right encoding based on width/height
    videoEncoding = determineAppropriateEncoding(isScreenShare, width, height);
    log.debug('using video encoding', videoEncoding);
  }

  if (!useSimulcast) {
    return [videoEncoding];
  }

  const presets = presetsForResolution(isScreenShare, width, height);
  let midPreset: VideoPreset | undefined;
  const lowPreset = presets[0];
  if (presets.length > 1) {
    [,midPreset] = presets;
  }
  const original = new VideoPreset(
    width, height, videoEncoding.maxBitrate, videoEncoding.maxFramerate,
  );

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
    return encodingsFromPresets(width, height, [
      lowPreset, midPreset, original,
    ]);
  }
  if (size >= 500) {
    return encodingsFromPresets(width, height, [
      lowPreset, original,
    ]);
  }
  return encodingsFromPresets(width, height, [
    original,
  ]);
}

/* @internal */
export function determineAppropriateEncoding(
  isScreenShare: boolean,
  width: number,
  height: number,
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

  return encoding;
}

/* @internal */
export function presetsForResolution(
  isScreenShare: boolean, width: number, height: number,
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
    encodings.push({
      rid,
      scaleResolutionDownBy: size / preset.height,
      maxBitrate: preset.encoding.maxBitrate,
      /* @ts-ignore */
      maxFramerate: preset.encoding.maxFramerate,
    });
  });
  return encodings;
}
