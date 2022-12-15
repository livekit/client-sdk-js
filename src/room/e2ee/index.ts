import { E2EE_FLAG } from './constants';
import log from '../../logger';
import type { EncodeMessage, InitMessage, SetKeyMessage } from './types';
// eslint-disable-next-line import/extensions
// @ts-ignore
import WebWorkerURL from './e2ee.worker.js?worker&url';
import { supportsScriptTransform } from './utils';
import type Room from '../Room';
import { ParticipantEvent, RoomEvent } from '../events';
import type RemoteTrack from '../track/RemoteTrack';
import type { Track } from '../track/Track';
import LocalTrack from '../track/LocalTrack';
import { isSafari } from '../utils';

export async function createE2EEKey(): Promise<Uint8Array> {
  return window.crypto.getRandomValues(new Uint8Array(32));
}

export class E2EEManager {
  private worker?: Worker;

  private room: Room;

  private webWorkerUrl = new URL(WebWorkerURL, import.meta.url);

  private workerAsModule = true;

  key?: CryptoKey | Uint8Array;

  constructor(room: Room, webWorkerUrl?: URL, workerAsModule: boolean = true) {
    this.room = room;
    this.setupEventListeners();
    if (webWorkerUrl) {
      this.webWorkerUrl = webWorkerUrl;
    }
    this.workerAsModule = workerAsModule;
  }

  private setupEventListeners() {
    this.room.on(RoomEvent.TrackSubscribed, (track) => {
      this.setupE2EEReceiver(track);
    });
    this.room.localParticipant.on(ParticipantEvent.LocalTrackPublished, (publication) => {
      // if (isSafari()) {
      //   setTimeout(
      //     () => this.setupE2EESender(publication.track!, publication.track!.sender!),
      //     4_000,
      //   );
      // } else {
      this.setupE2EESender(publication.track!, publication.track!.sender!);
      // }
    });
  }

  setEnabled(enabled: boolean) {
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
      this.worker?.postMessage(msg);
    } else if (!enabled && this.worker) {
      this.worker.terminate();
    }
  }

  setKey(participantId: string | undefined, key: Uint8Array, keyIndex?: number) {
    if (this.worker) {
      const msg: SetKeyMessage = {
        kind: 'setKey',
        payload: {
          participantId,
          key,
          keyIndex,
        },
      };
      this.worker.postMessage(msg);
    }
  }

  setupE2EEReceiver(track: RemoteTrack) {
    if (!track.receiver) {
      return;
    }
    this.handleReceiver(track.receiver);
  }

  setupE2EESender(track: Track, sender: RTCRtpSender, localId?: string) {
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
  handleReceiver(receiver: RTCRtpReceiver, participantId?: string) {
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
  handleSender(sender: RTCRtpSender, participantId?: string) {
    if (E2EE_FLAG in sender || !this.worker) {
      return;
    }
    // @ts-ignore
    sender[E2EE_FLAG] = true;

    if (supportsScriptTransform()) {
      console.warn('initialize script transform');

      const options = {
        kind: 'encode',
        participantId,
      };
      // @ts-ignore
      sender.transform = new RTCRtpScriptTransform(this.worker, options);
    } else {
      console.warn('initialize encoder');
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
