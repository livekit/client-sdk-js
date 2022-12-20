import { E2EE_FLAG } from './constants';

import log from '../logger';
import type { E2EEOptions, EncodeMessage, InitMessage, KeyInfo, SetKeyMessage } from './types';
// eslint-disable-next-line import/extensions
// @ts-ignore
import WebWorkerURL from './e2ee.worker.js?worker&url';
import { supportsScriptTransform } from './utils';
import type Room from '../room/Room';
import { ParticipantEvent, RoomEvent } from '../room/events';
import type RemoteTrack from '../room/track/RemoteTrack';
import type { Track } from '../room/track/Track';
import LocalTrack from '../room/track/LocalTrack';
import type { KeyProvider } from './keyProvider';

export class E2EEManager {
  protected worker?: Worker;

  protected room?: Room;

  protected webWorkerUrl = new URL(WebWorkerURL, import.meta.url);

  protected workerAsModule = true;

  protected key?: CryptoKey | Uint8Array;

  private enabled: boolean;

  private keyProvider: KeyProvider;

  get isEnabled() {
    return this.enabled;
  }

  constructor(options: E2EEOptions) {
    this.keyProvider = options.keyProvider;
    this.enabled = false;
  }

  /**
   * @internal
   */
  registerOnRoom(room: Room) {
    if (room !== this.room) {
      this.room = room;
      this.setupEventListeners(room, this.keyProvider);
    }
  }

  /**
   * @internal
   */
  async setEnabled(enabled: boolean) {
    log.info(`set e2ee to ${enabled}`);
    if (enabled && !this.worker) {
      this.worker = new Worker(this.webWorkerUrl, {
        type: this.workerAsModule ? 'module' : 'classic',
      });
      const msg: InitMessage = {
        kind: 'init',
        payload: {
          sharedKey: true,
        },
      };
      log.info(`initializing worker`, { worker: this.worker });
      this.worker.postMessage(msg);
      this.worker.onmessage = (ev: MessageEvent<InitMessage>) => {
        const { kind } = ev.data;
        if (kind === 'init') {
          this.keyProvider.getKeys().forEach((keyInfo) => {
            this.postKey(keyInfo);
          });
        }
      };
    } else if (!enabled && this.worker) {
      this.worker.terminate();
    }
    this.enabled = enabled;
  }

  private setupEventListeners(room: Room, keyProvider: KeyProvider) {
    room.on(RoomEvent.TrackSubscribed, (track) => {
      this.setupE2EEReceiver(track);
    });
    room.localParticipant.on(ParticipantEvent.LocalTrackPublished, (publication) => {
      this.setupE2EESender(publication.track!, publication.track!.sender!);
    });
    keyProvider.on('setKey', this.postKey);
  }

  private postKey({ key, participantId, keyIndex }: KeyInfo) {
    const msg: SetKeyMessage = {
      kind: 'setKey',
      payload: {
        participantId,
        key,
        keyIndex,
      },
    };
    this.worker?.postMessage(msg);
  }

  private setupE2EEReceiver(track: RemoteTrack) {
    if (!track.receiver) {
      return;
    }
    this.handleReceiver(track.receiver);
  }

  private setupE2EESender(track: Track, sender: RTCRtpSender, localId?: string) {
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
  private handleReceiver(receiver: RTCRtpReceiver, participantId?: string) {
    if (E2EE_FLAG in receiver || !this.worker) {
      return;
    }
    // @ts-ignore
    receiver[E2EE_FLAG] = true;

    if (supportsScriptTransform()) {
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
        payload: {
          readableStream: receiverStreams.readable,
          writableStream: receiverStreams.writable,
          participantId,
        },
      };
      this.worker.postMessage(msg, [receiverStreams.readable, receiverStreams.writable]);
    }
  }

  /**
   * Handles the given {@code RTCRtpSender} by creating a {@code TransformStream} which will inject
   * a frame encoder.
   *
   */
  private handleSender(sender: RTCRtpSender, participantId?: string) {
    if (E2EE_FLAG in sender || !this.worker) {
      return;
    }
    // @ts-ignore
    sender[E2EE_FLAG] = true;

    if (supportsScriptTransform()) {
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
        payload: {
          readableStream: senderStreams.readable,
          writableStream: senderStreams.writable,
          participantId,
        },
      };
      this.worker.postMessage(msg, [senderStreams.readable, senderStreams.writable]);
    }
  }
}
