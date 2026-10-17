import { Mutex } from '@livekit/mutex';
import type { CoreRoom } from '../room/CoreRoom';
import { RoomEvent } from '../room/events';
import {
  type Disposable,
  type ExtensionContext,
  type RoomApiProvider,
  type SlotProvider,
  defineExtension,
} from '../room/extensions';
import type Participant from '../room/participant/Participant';
import { isLocalParticipant } from '../room/utils';
import { type BaseE2EEManager, E2EEManager } from './E2eeManager';
import { EncryptionEvent } from './events';
import type { E2EEOptions } from './types';

/**
 * Methods the `e2ee` extension adds to the room.
 * @experimental
 */
export interface E2eeRoomApi {
  /**
   * @experimental
   */
  setE2EEEnabled(enabled: boolean): Promise<void>;
}

/** @experimental */
export const e2ee = /* @__PURE__ */ defineExtension(
  'e2ee',
  [],
  (
    room: CoreRoom,
    _ctx: ExtensionContext,
    options: E2EEOptions | undefined,
  ): RoomApiProvider<E2eeRoomApi> &
    Partial<SlotProvider<'e2eeManager'>> &
    Disposable & { manager: BaseE2EEManager | undefined } => {
    const dcEncryptionEnabled = !room.options.e2ee;
    const e2eeOptions: E2EEOptions | undefined =
      options ?? (room.options.encryption || room.options.e2ee);

    let manager: BaseE2EEManager | undefined;
    // an app-supplied manager (and its worker) can be shared between rooms; the app owns it
    let dispose = () => {};
    if (e2eeOptions) {
      if ('e2eeManager' in e2eeOptions) {
        manager = e2eeOptions.e2eeManager;
        manager.isDataChannelEncryptionEnabled = dcEncryptionEnabled;
      } else {
        const owned = new E2EEManager(e2eeOptions, dcEncryptionEnabled);
        manager = owned;
        dispose = () => {
          owned.dispose();
          e2eeOptions.worker.terminate();
        };
      }
      const onStatusChanged = (enabled: boolean, participant: Participant) => {
        if (isLocalParticipant(participant)) {
          room.isE2EEEnabled = enabled;
        }
        room.emit(RoomEvent.ParticipantEncryptionStatusChanged, enabled, participant);
      };
      const onError = (error: Error, participantIdentity?: string) => {
        const participant = participantIdentity
          ? room.getParticipantByIdentity(participantIdentity)
          : undefined;
        room.emit(RoomEvent.EncryptionError, error, participant);
      };
      manager.on(EncryptionEvent.ParticipantEncryptionStatusChanged, onStatusChanged);
      manager.on(EncryptionEvent.EncryptionError, onError);
      if ('e2eeManager' in e2eeOptions) {
        // the app's manager outlives this room: take this room's listeners off it
        const shared = manager;
        dispose = () => {
          shared.off(EncryptionEvent.ParticipantEncryptionStatusChanged, onStatusChanged);
          shared.off(EncryptionEvent.EncryptionError, onError);
        };
      }
      manager.setup(room);
      manager.setupEngine(room.engine);
    }

    const stateMutex = new Mutex();
    return {
      manager,
      e2eeManager: manager,
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
      dispose,
    };
  },
);
