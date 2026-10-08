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
    _ctx: ExtensionContext,
    options: FrameMetadataOptions | undefined,
  ): ExtensionResult & { manager: FrameMetadataManager } => {
    if (options) {
      // the engine (worker lookup), the join request (capability) and publishTrack (requested
      // features) read this slice of the room options, so a configured extension fills it
      room.options.frameMetadata = options;
    }
    const manager = new FrameMetadataManager(
      options ?? room.options.frameMetadata ?? room.options.packetTrailer,
    );
    manager.setup(room);
    return { manager };
  },
);
