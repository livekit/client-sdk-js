import { e2eeFlag } from './constants';
import log from '../../logger';
import type { EncodeMessage, SetKeyMessage } from './types';
// eslint-disable-next-line import/extensions
import WebWorker from './e2ee.worker.js?worker';
import { supportsScriptTransform } from './utils';
import type Room from '../Room';
import { ParticipantEvent, RoomEvent } from '../events';
import type RemoteTrack from '../track/RemoteTrack';
import type RemoteParticipant from '../participant/RemoteParticipant';
import type { Track } from '../track/Track';
import LocalTrack from '../track/LocalTrack';

export async function createE2EEKey(): Promise<Uint8Array> {
  return window.crypto.getRandomValues(new Uint8Array(32));
}

export class E2EEManager {
  private worker?: Worker;

  private room: Room;

  key?: CryptoKey | Uint8Array;

  constructor(room: Room) {
    this.room = room;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.room.on(RoomEvent.TrackSubscribed, (track, _, participant) => {
      this.setupE2EEReceiver(track, participant);
    });
    this.room.localParticipant.on(ParticipantEvent.PCTrackAdded, (track, sender) =>
      this.setupE2EESender(track, sender as RTCRtpSender, 'lk-local-id'),
    );
  }

  setEnabled(enabled: boolean) {
    log.info(`set e2ee to ${enabled}`);
    if (enabled && !this.worker) {
      this.worker = new WebWorker();
    } else if (!enabled && this.worker) {
      this.worker.terminate();
    }
  }

  setKey(participantId: string, key: CryptoKey | Uint8Array, keyIndex?: number) {
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

  setupE2EEReceiver(track: RemoteTrack, participant: RemoteParticipant) {
    if (!track.receiver) {
      return;
    }
    this.handleReceiver(track.receiver, participant.identity);
  }

  setupE2EESender(track: Track, sender: RTCRtpSender, localId: string) {
    if (!(track instanceof LocalTrack) || !sender) {
      return;
    }
    this.handleSender(sender, localId);
  }

  /**
   * Handles the given {@code RTCRtpReceiver} by creating a {@code TransformStream} which will inject
   * a frame decoder.
   *
   */
  handleReceiver(receiver: RTCRtpReceiver, participantId: string) {
    if (e2eeFlag in receiver || !this.worker) {
      return;
    }
    // @ts-ignore
    receiver[e2eeFlag] = true;

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
  handleSender(sender: RTCRtpSender, participantId: string) {
    if (e2eeFlag in sender || !this.worker) {
      return;
    }
    // @ts-ignore
    sender[e2eeFlag] = true;

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
