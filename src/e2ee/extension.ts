import { Mutex } from '@livekit/mutex';
import type { CoreRoom } from '../room/CoreRoom';
import { RoomEvent } from '../room/events';
import { type ExtensionContext, type ExtensionResult, defineExtension } from '../room/extensions';
import { isLocalParticipant } from '../room/utils';
import { type BaseE2EEManager, E2EEManager } from './E2eeManager';
import { EncryptionEvent } from './events';
import type { E2EEOptions } from './types';

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
export type E2eeExtensionOptions = E2EEOptions & {
  /**
   * Also encrypt data packets. This is what the `encryption` room option enables and the
   * deprecated `e2ee` room option does not.
   */
  encryptDataChannel?: boolean;
};

export const e2ee = /* @__PURE__ */ defineExtension(
  'e2ee',
  [],
  (
    room: CoreRoom,
    ctx: ExtensionContext,
    options: E2eeExtensionOptions | undefined,
  ): ExtensionResult<E2eeRoomApi> & { manager: BaseE2EEManager | undefined } => {
    // when encryption is enabled via `options.encryption`, we enable data channel encryption
    const dcEncryptionEnabled = options ? !!options.encryptDataChannel : !!room.options.encryption;
    const e2eeOptions: E2EEOptions | undefined =
      options ?? (room.options.encryption || room.options.e2ee);

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
);
