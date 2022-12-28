import { E2EE_FLAG } from './constants';

import log from '../logger';
import {
  EncryptionEvent,
  E2EEManagerCallbacks,
  E2EEOptions,
  E2EEWorkerMessage,
  EnableMessage,
  EncodeMessage,
  InitMessage,
  KeyInfo,
  SetKeyMessage,
} from './types';
// eslint-disable-next-line import/extensions
// @ts-ignore
import WebWorkerURL from './e2ee.worker.js?worker&url';
import { isE2EESupported, isScriptTransformSupported } from './utils';
import type Room from '../room/Room';
import { ParticipantEvent, RoomEvent } from '../room/events';
import type RemoteTrack from '../room/track/RemoteTrack';
import type { Track } from '../room/track/Track';
import LocalTrack from '../room/track/LocalTrack';
import type { BaseKeyProvider } from './keyProvider';
import EventEmitter from 'events';
import type TypedEmitter from 'typed-emitter';
import { E2EEError, E2EEErrorReason } from './errors';
import { Encryption_Type } from '../proto/livekit_models';

export class E2EEManager extends (EventEmitter as new () => TypedEmitter<E2EEManagerCallbacks>) {
  protected worker?: Worker;

  protected room?: Room;

  protected webWorkerUrl = new URL(WebWorkerURL, import.meta.url);

  protected workerAsModule = true;

  private encryptionEnabled: boolean;

  private keyProvider: BaseKeyProvider;

  get isEnabled() {
    return this.encryptionEnabled;
  }

  constructor(options: E2EEOptions) {
    super();
    this.keyProvider = options.keyProvider;
    this.encryptionEnabled = false;
  }

  /**
   * @internal
   */
  setup(room: Room) {
    if (!isE2EESupported()) {
      throw new E2EEError(
        'tried to setup end-to-end encryption on an unsupported browser',
        E2EEErrorReason.BrowserUnsupported,
      );
    }
    log.info('setting up e2ee');
    if (room !== this.room) {
      this.room = room;
      this.setupEventListeners(room, this.keyProvider);
      this.worker = new Worker(this.webWorkerUrl, {
        type: this.workerAsModule ? 'module' : 'classic',
      });
      const msg: InitMessage = {
        kind: 'init',
        data: {
          sharedKey: true,
        },
      };
      log.info(`initializing worker`, { worker: this.worker });
      this.worker.onmessage = this.onWorkerMessage;
      this.worker.onerror = this.onWorkerError;
      this.worker.postMessage(msg);
    }
  }

  /**
   * @internal
   */
  async setParticipantCryptorEnabled(enabled: boolean, participantId?: string) {
    log.info(`set e2ee to ${enabled}`);

    if (this.worker) {
      const enableMsg: EnableMessage = {
        kind: 'enable',
        data: { enabled, participantId },
      };
      this.worker.postMessage(enableMsg);
    } else {
      throw new E2EEError('failed to enable e2ee, worker is not ready');
    }
  }

  private onWorkerMessage = (ev: MessageEvent<E2EEWorkerMessage>) => {
    const { kind, data } = ev.data;
    switch (kind) {
      case 'error':
        console.log('error in worker', { data });
        // this.emit(EncryptionEvent.Error, data.error.reason);
        break;
      case 'enable':
        if (this.encryptionEnabled !== data.enabled && !data.participantId) {
          this.emit(
            EncryptionEvent.ParticipantEncryptionStatusChanged,
            data.enabled,
            this.room?.localParticipant,
          );
          this.encryptionEnabled = data.enabled;
        } else if (data.participantId) {
          const participant = this.room?.getParticipantByIdentity(data.participantId);
          this.emit(EncryptionEvent.ParticipantEncryptionStatusChanged, data.enabled, participant);
        }
        if (this.encryptionEnabled) {
          console.log('updating keys from keyprovider', this.keyProvider.getKeys());
          this.keyProvider.getKeys().forEach((keyInfo) => {
            this.postKey(keyInfo);
          });
        }
        break;
      default:
        break;
    }
  };

  private onWorkerError = (ev: ErrorEvent) => {
    log.error('e2ee worker encountered an error:', { error: ev.error });
    this.emit(EncryptionEvent.Error, E2EEErrorReason.WorkerError);
  };

  private setupEventListeners(room: Room, keyProvider: BaseKeyProvider) {
    room.on(RoomEvent.TrackPublished, (pub, participant) =>
      this.setParticipantCryptorEnabled(
        pub.trackInfo!.encryption !== Encryption_Type.NONE,
        participant.identity,
      ),
    );
    room.on(RoomEvent.TrackSubscribed, (track, _, participant) => {
      this.setupE2EEReceiver(track, participant.identity);
    });
    room.localParticipant.on(ParticipantEvent.LocalTrackPublished, (publication) => {
      this.setupE2EESender(
        publication.track!,
        publication.track!.sender!,
        room.localParticipant.identity,
      );
    });
    keyProvider.on('setKey', (keyInfo) => this.postKey(keyInfo));
  }

  private postKey({ key, participantId, keyIndex }: KeyInfo) {
    if (!this.worker) {
      throw Error('could not set key, worker is missing');
    }
    const msg: SetKeyMessage = {
      kind: 'setKey',
      data: {
        participantId,
        key,
        keyIndex,
      },
    };
    this.worker.postMessage(msg);
  }

  private setupE2EEReceiver(track: RemoteTrack, remoteId: string) {
    if (!track.receiver) {
      return;
    }
    this.handleReceiver(track.receiver, remoteId);
  }

  private setupE2EESender(track: Track, sender: RTCRtpSender, localId: string) {
    if (!(track instanceof LocalTrack) || !sender) {
      if (!sender) log.warn('early return because sender is not ready');
      return;
    }
    this.handleSender(sender, localId);
  }

  /**
   * Handles the given {@code RTCRtpReceiver} by creating a {@code TransformStream} which will inject
   * a frame decoder.
   *
   */
  private handleReceiver(receiver: RTCRtpReceiver, participantId: string) {
    if (E2EE_FLAG in receiver || !this.worker) {
      return;
    }

    if (isScriptTransformSupported()) {
      const options = {
        kind: 'decode',
        participantId,
      };
      // @ts-ignore
      receiver.transform = new RTCRtpScriptTransform(this.worker, options);
    } else {
      // @ts-ignore
      const receiverStreams = receiver.createEncodedStreams();
      const msg: EncodeMessage = {
        kind: 'decode',
        data: {
          readableStream: receiverStreams.readable,
          writableStream: receiverStreams.writable,
          participantId,
        },
      };
      this.worker.postMessage(msg, [receiverStreams.readable, receiverStreams.writable]);
    }

    // @ts-ignore
    receiver[E2EE_FLAG] = true;
  }

  /**
   * Handles the given {@code RTCRtpSender} by creating a {@code TransformStream} which will inject
   * a frame encoder.
   *
   */
  private handleSender(sender: RTCRtpSender, participantId: string) {
    if (E2EE_FLAG in sender || !this.worker) {
      return;
    }

    if (isScriptTransformSupported()) {
      log.warn('initialize script transform');

      const options = {
        kind: 'encode',
        participantId,
      };
      // @ts-ignore
      sender.transform = new RTCRtpScriptTransform(this.worker, options);
    } else {
      log.warn('initialize encoder');
      // @ts-ignore
      const senderStreams = sender.createEncodedStreams();
      const msg: EncodeMessage = {
        kind: 'encode',
        data: {
          readableStream: senderStreams.readable,
          writableStream: senderStreams.writable,
          participantId,
        },
      };
      this.worker.postMessage(msg, [senderStreams.readable, senderStreams.writable]);
    }

    // @ts-ignore
    sender[E2EE_FLAG] = true;
  }
}
