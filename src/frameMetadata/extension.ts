import type { CoreRoom } from '../room/CoreRoom';
import type { ExtensionContext, ExtensionResult, RoomExtension } from '../room/extensions';
import { FrameMetadataManager } from './FrameMetadataManager';

/**
 * Frame metadata extraction on subscribed video tracks (`frameMetadata` room option).
 * Publishing frame metadata is part of the core publish path and needs no extension.
 */
export const frameMetadata = {
  key: Symbol('frameMetadata'),
  install(
    room: CoreRoom,
    _ctx: ExtensionContext,
  ): ExtensionResult & { manager: FrameMetadataManager } {
    const manager = new FrameMetadataManager(
      room.options.frameMetadata ?? room.options.packetTrailer,
    );
    manager.setup(room);
    return { manager };
  },
} satisfies RoomExtension;
