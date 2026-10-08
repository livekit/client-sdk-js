import type { CoreRoom } from '../room/CoreRoom';
import { type ExtensionContext, type ExtensionResult, defineExtension } from '../room/extensions';
import { FrameMetadataManager, type FrameMetadataOptions } from './FrameMetadataManager';

/**
 * Frame metadata extraction on subscribed video tracks (`frameMetadata` room option).
 * Publishing frame metadata is part of the core publish path and needs no extension.
 */
export const frameMetadata = /* @__PURE__ */ defineExtension(
  'frameMetadata',
  [],
  (
    room: CoreRoom,
    _ctx: ExtensionContext,
    options: FrameMetadataOptions | undefined,
  ): ExtensionResult & { manager: FrameMetadataManager } => {
    const manager = new FrameMetadataManager(
      options ?? room.options.frameMetadata ?? room.options.packetTrailer,
    );
    manager.setup(room);
    return { manager };
  },
);
