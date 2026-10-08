import { Mutex } from '@livekit/mutex';
import type { CoreRoom } from '../room/CoreRoom';
import { RoomEvent } from '../room/events';
import type { ExtensionContext, ExtensionResult, RoomExtension } from '../room/extensions';
import { isLocalParticipant } from '../room/utils';
import { type BaseE2EEManager, E2EEManager } from './E2eeManager';
import { EncryptionEvent } from './events';

/** Methods the `e2ee` extension adds to the room. */
export interface E2eeRoomApi {
  /**
   * @experimental
   */
  setE2EEEnabled(enabled: boolean): Promise<void>;
}

/**
 * End-to-end encryption (`e2ee` / `encryption` room options, `setE2EEEnabled`). Without the
 * options the extension installs nothing, and `setE2EEEnabled` rejects.
 */
export const e2ee = {
  key: /* @__PURE__ */ Symbol('e2ee'),
  install(
    room: CoreRoom,
    ctx: ExtensionContext,
  ): ExtensionResult<E2eeRoomApi> & { manager: BaseE2EEManager | undefined } {
    // when encryption is enabled via `options.encryption`, we enable data channel encryption
    const dcEncryptionEnabled = !!room.options.encryption;
    const e2eeOptions = room.options.encryption || room.options.e2ee;

    let manager: BaseE2EEManager | undefined;
    if (e2eeOptions) {
      if ('e2eeManager' in e2eeOptions) {
        manager = e2eeOptions.e2eeManager;
        manager.isDataChannelEncryptionEnabled = dcEncryptionEnabled;
      } else {
        manager = new E2EEManager(e2eeOptions, dcEncryptionEnabled);
      }
      manager.on(EncryptionEvent.ParticipantEncryptionStatusChanged, (enabled, participant) => {
        if (isLocalParticipant(participant)) {
          room.isE2EEEnabled = enabled;
        }
        room.emit(RoomEvent.ParticipantEncryptionStatusChanged, enabled, participant);
      });
      manager.on(EncryptionEvent.EncryptionError, (error, participantIdentity) => {
        const participant = participantIdentity
          ? room.getParticipantByIdentity(participantIdentity)
          : undefined;
        room.emit(RoomEvent.EncryptionError, error, participant);
      });
      ctx.setE2eeManager(manager);
      manager.setup(room);
      manager.setupEngine(room.engine);
    }

    const stateMutex = new Mutex();
    return {
      manager,
      room: {
        setE2EEEnabled: async (enabled) => {
          const unlock = await stateMutex.lock();
          try {
            if (manager) {
              if (room.isE2EEEnabled !== enabled) {
                await room.localParticipant.setE2EEEnabled(enabled);

                if (room.localParticipant.identity !== '') {
                  manager.setParticipantCryptorEnabled(enabled, room.localParticipant.identity);
                }
              }
            } else {
              throw Error('e2ee not configured, please set e2ee settings within the room options');
            }
          } finally {
            unlock();
          }
        },
      },
      dispose: () => manager?.dispose?.(),
    };
  },
} satisfies RoomExtension<E2eeRoomApi>;
