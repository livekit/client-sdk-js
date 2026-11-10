import type { CoreRoom } from '../room/CoreRoom';
import {
  type Disposable,
  type ExtensionContext,
  type SlotProvider,
  defineExtension,
} from '../room/extensions';
import { FrameMetadataManager, type FrameMetadataOptions } from './FrameMetadataManager';

/**
 * Frame metadata extraction on subscribed video tracks (`frameMetadata` room option).
 * Publishing frame metadata is part of the core publish path and needs no extension.
 * @experimental
 */
export const frameMetadata = /* @__PURE__ */ defineExtension(
  'frameMetadata',
  [],
  (
    room: CoreRoom,
    _ctx: ExtensionContext,
    options: FrameMetadataOptions | undefined,
  ): Partial<SlotProvider<'frameMetadataOptions'>> &
    Disposable & { manager: FrameMetadataManager } => {
    const resolved = options ?? room.options.frameMetadata ?? room.options.packetTrailer;
    const manager = new FrameMetadataManager(resolved);
    manager.setup(room);
    // the engine (sender transform), the join request capability and publishTrack read the slot
    return {
      manager,
      frameMetadataOptions: resolved,
      dispose: () => manager.dispose(),
    };
  },
);
