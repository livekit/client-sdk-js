import { PacketTrailerFeature } from '@livekit/protocol';
import { isInsertableStreamSupported } from '../e2ee/utils';
import type { TrackPublishDefaults } from '../room/track/options';
import { isScriptTransformSupportedForWorker } from '../room/utils';
import type { FrameMetadataOptions } from './FrameMetadataManager';
import type { FrameMetadataPublishOptions } from './types';

export function shouldUseFrameMetadataScriptTransform() {
  return isScriptTransformSupportedForWorker();
}

export function isFrameMetadataSupported(options?: FrameMetadataOptions) {
  return (
    !!options?.worker && (isInsertableStreamSupported() || shouldUseFrameMetadataScriptTransform())
  );
}

export function hasFrameMetadataPublishOptions(options?: FrameMetadataPublishOptions): boolean {
  return !!(options?.timestamp || options?.frameId);
}

export function getFrameMetadataFeatures(
  options?: FrameMetadataPublishOptions,
): PacketTrailerFeature[] {
  const features: PacketTrailerFeature[] = [];
  if (options?.timestamp) {
    features.push(PacketTrailerFeature.PTF_USER_TIMESTAMP);
  }
  if (options?.frameId) {
    features.push(PacketTrailerFeature.PTF_FRAME_ID);
  }
  return features;
}

export function getFrameMetadataPublishOptions(
  features?: PacketTrailerFeature[],
): FrameMetadataPublishOptions | undefined {
  if (!features || features.length === 0) {
    return undefined;
  }

  const options: FrameMetadataPublishOptions = {};
  if (features.includes(PacketTrailerFeature.PTF_USER_TIMESTAMP)) {
    options.timestamp = true;
  }
  if (features.includes(PacketTrailerFeature.PTF_FRAME_ID)) {
    options.frameId = true;
  }

  return options.timestamp || options.frameId ? options : undefined;
}

/**
 * The deprecated `packetTrailer` publish option. Only the full entry's types declare it (see
 * `index.ts`), but both builds still honor it.
 */
type WithPacketTrailer = { packetTrailer?: FrameMetadataPublishOptions };

/** The requested frame metadata: `frameMetadata`, or the deprecated `packetTrailer`. */
export function getPublishFrameMetadata(
  opts?: TrackPublishDefaults,
): FrameMetadataPublishOptions | undefined {
  return opts?.frameMetadata ?? (opts as WithPacketTrailer | undefined)?.packetTrailer;
}

/** Sets `frameMetadata` and the deprecated `packetTrailer` alike. */
export function setPublishFrameMetadata(
  opts: TrackPublishDefaults,
  value: FrameMetadataPublishOptions | undefined,
) {
  opts.frameMetadata = value;
  (opts as WithPacketTrailer).packetTrailer = value;
}
