import 'webrtc-adapter';
import type { E2eeRoomApi } from './e2ee/extension';
import type { FrameMetadataPublishOptions } from './frameMetadata/types';
import type { ChatLocalApi } from './room/chat/extension';
import type { DataStreamLocalApi, DataStreamRoomApi } from './room/data-stream/extension';
import type { DataTrackLocalApi } from './room/data-track/extension';
import type { RpcLocalApi, RpcRoomApi } from './room/rpc/extension';
import type { RpcLegacyLocalApi } from './room/rpc/legacyExtension';
import type { SimulatedParticipantsRoomApi } from './room/simulated-participants/extension';
import { isBackupVideoCodec } from './room/track/options';
import type { VideoLocalApi } from './room/video/extension';

export * from './exports';
export { Room } from './room/Room';
export type { CoreRoom } from './room/CoreRoom';

// Deprecated aliases stay in the full build only.
export type {
  /** @deprecated Use {@link FrameMetadata} instead. */
  PacketTrailerMetadata,
  /** @deprecated Use {@link FrameMetadataPublishOptions} instead. */
  PacketTrailerPublishOptions,
} from './frameMetadata/types';
export {
  /** @deprecated Use {@link FrameMetadataManager} instead. */
  PacketTrailerManager,
  /** @deprecated Use {@link FrameMetadataOptions} instead. */
  type PacketTrailerOptions,
} from './frameMetadata/FrameMetadataManager';
/** @deprecated Use {@link isBackupVideoCodec} instead */
export const isBackupCodec = isBackupVideoCodec;

// The full build installs every extension, so `CoreRoom` and `LocalParticipant` carry every
// extension's methods wherever they appear (event callbacks, type guards, processor hooks), not
// only on the `Room` class. These augmentations live in the main entry on purpose: the core entry
// never loads this file, so a light room keeps the narrow types.
declare module './room/CoreRoom' {
  interface CoreRoom
    extends DataStreamRoomApi, RpcRoomApi, E2eeRoomApi, SimulatedParticipantsRoomApi {}
}
declare module './room/participant/LocalParticipant' {
  interface LocalParticipant
    extends
      DataStreamLocalApi,
      RpcLocalApi,
      RpcLegacyLocalApi,
      DataTrackLocalApi,
      VideoLocalApi,
      ChatLocalApi {}
}

// Deprecated options stay in the full build only.
declare module './room/track/options' {
  interface TrackPublishDefaults {
    /**
     * @deprecated Use {@link TrackPublishDefaults.frameMetadata} instead.
     */
    packetTrailer?: FrameMetadataPublishOptions;
  }
}
