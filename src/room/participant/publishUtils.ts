import log from '../../logger';
import { TrackSource } from '../../proto/livekit_models';
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
export const presets169 = Object.values(VideoPresets);

/* @internal */
export const presets43 = Object.values(VideoPresets43);

/* @internal */
export const presetsScreenShare = Object.values(ScreenSharePresets);

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
  // TODO this currently prevents any screenshare tracks from using simulcast
  // does it even make sense to have simulcast layers for screenshare then?
  const useSimulcast = !isScreenShare && options?.simulcast;

  if ((!videoEncoding && !useSimulcast) || !width || !height) {
    // when we aren't simulcasting, will need to return a single encoding without
    // capping bandwidth. we always require a encoding for dynacast
    return [{}];
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
    [, midPreset] = presets;
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
    return customSimulcastLayersScreenShare ?? presetsScreenShare;
  }

  if (customSimulcastLayersCamera) {
    return customSimulcastLayersCamera;
  }
  const aspect = width > height ? width / height : height / width;
  if (Math.abs(aspect - 16.0 / 9) < Math.abs(aspect - 4.0 / 3)) {
    return presets169;  // TODO determine the right presets to send back, depending on the resolution
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
      scaleResolutionDownBy: size / Math.min(preset.width, preset.height),
      maxBitrate: preset.encoding.maxBitrate,
      /* @ts-ignore */
      maxFramerate: preset.encoding.maxFramerate,
    });
  });
  return encodings;
}

let customSimulcastLayersCamera: Array<VideoPreset> | undefined;
let customSimulcastLayersScreenShare: Array<VideoPreset> | undefined;

/**
 * Specify up to 3 custom presets that will be used for simulcast layers.
 * The presets must be ordered from lowest quality to highest quality.
 * Usually you would want the highest quality preset to be the same as the video preset
 * used to acquire streams.
 */
export function setCustomSimulcastLayers(
  kind: TrackSource.SCREEN_SHARE | TrackSource.CAMERA,
  presets: Array<VideoPreset>,
) {
  // TODO should we pre-sort the incoming presets array by dimensions and/or bitrate?
  if (presets.length > 3) {
    log.warn('A maximum of three simulcast layers is supported, only the first three will be used');
    presets = presets.slice(0, 3);
  }
  // limiting height values taken from https://chromium.googlesource.com/external/webrtc/+/master/media/engine/simulcast.cc#90
  if (presets.length > 2 && presets[2].height >= 270 && presets[2].height < 540) {
    log.warn('Only two simulcast layers will be used. The preset resolution is too small for three.');
  } else if (presets.length > 1 && presets[2].height < 270) {
    log.warn('No simulcast layers will be used. The preset resolution is too small.');
  }
  log.debug('presets length', presets.length);
  switch (kind) {
    case TrackSource.CAMERA:
      customSimulcastLayersCamera = [...presets];
      break;
    case TrackSource.SCREEN_SHARE:
      customSimulcastLayersScreenShare = [...presets];
      break;
    default:
      break;
  }
}
