import { PacketTrailerFeature } from '@livekit/protocol';
import { isInsertableStreamSupported } from '../e2ee/utils';
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
