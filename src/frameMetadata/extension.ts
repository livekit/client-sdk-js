import type { CoreRoom } from '../room/CoreRoom';
import {
  type ConfigurableExtension,
  type ExtensionContext,
  type ExtensionResult,
  defineExtension,
} from '../room/extensions';
import { FrameMetadataManager, type FrameMetadataOptions } from './FrameMetadataManager';

/**
 * Frame metadata extraction on subscribed video tracks (`frameMetadata` room option).
 * Publishing frame metadata is part of the core publish path and needs no extension.
 */
export type FrameMetadataExtension = ConfigurableExtension<
  ExtensionResult & { manager: FrameMetadataManager },
  FrameMetadataOptions,
  readonly []
>;

export const frameMetadata: FrameMetadataExtension = /* @__PURE__ */ defineExtension(
  'frameMetadata',
  [],
  (
    room: CoreRoom,
    ctx: ExtensionContext,
    options: FrameMetadataOptions | undefined,
  ): ExtensionResult & { manager: FrameMetadataManager } => {
    const resolved = options ?? room.options.frameMetadata ?? room.options.packetTrailer;
    if (resolved) {
      // the engine (sender transform), the join request (capability) and publishTrack read it
      ctx.setFrameMetadataOptions(resolved);
    }
    const manager = new FrameMetadataManager(resolved);
    manager.setup(room);
    return { manager, dispose: () => manager.dispose() };
  },
);
