import { isInsertableStreamSupported } from '../e2ee/utils';
import { isScriptTransformSupportedForWorker } from '../room/utils';
import type { PacketTrailerOptions } from './PacketTrailerManager';

export function shouldUsePacketTrailerScriptTransform() {
  return isScriptTransformSupportedForWorker();
}

export function isPacketTrailerSupported(options?: PacketTrailerOptions) {
  return (
    !!options?.worker && (isInsertableStreamSupported() || shouldUsePacketTrailerScriptTransform())
  );
}
