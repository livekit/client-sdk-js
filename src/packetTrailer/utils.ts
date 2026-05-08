import { PacketTrailerFeature } from '@livekit/protocol';
import { isInsertableStreamSupported } from '../e2ee/utils';
import { isScriptTransformSupportedForWorker } from '../room/utils';
import type { PacketTrailerOptions } from './PacketTrailerManager';
import type { PacketTrailerPublishOptions } from './types';

export function shouldUsePacketTrailerScriptTransform() {
  return isScriptTransformSupportedForWorker();
}

export function isPacketTrailerSupported(options?: PacketTrailerOptions) {
  return (
    !!options?.worker && (isInsertableStreamSupported() || shouldUsePacketTrailerScriptTransform())
  );
}

export function hasPacketTrailerPublishOptions(options?: PacketTrailerPublishOptions): boolean {
  return !!(options?.timestamp || options?.frameId);
}

export function getPacketTrailerFeatures(
  options?: PacketTrailerPublishOptions,
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

export function getPacketTrailerPublishOptions(
  features?: PacketTrailerFeature[],
): PacketTrailerPublishOptions | undefined {
  if (!features || features.length === 0) {
    return undefined;
  }

  const options: PacketTrailerPublishOptions = {};
  if (features.includes(PacketTrailerFeature.PTF_USER_TIMESTAMP)) {
    options.timestamp = true;
  }
  if (features.includes(PacketTrailerFeature.PTF_FRAME_ID)) {
    options.frameId = true;
  }

  return options.timestamp || options.frameId ? options : undefined;
}
