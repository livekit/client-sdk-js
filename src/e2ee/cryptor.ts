/* eslint-disable @typescript-eslint/no-unused-vars */
// TODO code inspired by https://github.com/webrtc/samples/blob/gh-pages/src/content/insertable-streams/endtoend-encryption/js/worker.js

import { workerLogger } from '../logger';
import {
  ENCRYPTION_ALGORITHM,
  IV_LENGTH,
  KEYRING_SIZE,
  RATCHET_WINDOW_SIZE,
  UNENCRYPTED_BYTES,
} from './constants';
import type { KeySet } from './types';
import { deriveKeys, importKey, isVideoFrame, ratchet } from './utils';

export interface CryptorConstructor {
  new (opts?: unknown): BaseCryptor;
}

export class BaseCryptor {
  setKey(key: Uint8Array, keyIndex?: number): Promise<void> {
    throw Error('not implemented for subclass');
  }

  encodeFunction(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    controller: TransformStreamDefaultController,
  ): Promise<any> {
    throw Error('not implemented for subclass');
  }

  decodeFunction(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    controller: TransformStreamDefaultController,
  ): Promise<any> {
    throw Error('not implemented for subclass');
  }
}

/**
 * Per-participant cipher holding the cryptographic keys and
 * encode/decode functions
 */
export class Cryptor extends BaseCryptor {
  private currentKeyIndex: number;

  private cryptoKeyRing: Array<KeySet>;

  private sendCounts: Map<number, number>;

  private sharedKey: boolean | undefined;

  constructor(opts?: { sharedKey?: boolean }) {
    super();
    this.currentKeyIndex = 0;
    this.cryptoKeyRing = new Array(KEYRING_SIZE);
    this.sendCounts = new Map();
    this.sharedKey = opts?.sharedKey;
  }

  async setKey(key: Uint8Array, keyIndex = -1) {
    if (key) {
      let newKey: CryptoKey | KeySet;
      if (this.sharedKey) {
        newKey = await crypto.subtle.importKey(
          'raw',
          key,
          {
            name: ENCRYPTION_ALGORITHM,
            length: 256,
          },
          false,
          ['encrypt', 'decrypt'],
        );
      } else {
        const material = await importKey(key);
        newKey = await deriveKeys(material);
      }
      workerLogger.debug('setting new key');
      this.setKeys(newKey, keyIndex);
    }
  }

  /**
   * Sets a set of keys and resets the sendCount.
   * decryption.
   */
  private setKeys(keys: KeySet | CryptoKey, keyIndex = -1) {
    if (keyIndex >= 0) {
      this.currentKeyIndex = keyIndex % this.cryptoKeyRing.length;
    }
    if (keys instanceof CryptoKey) {
      // this is the path for sharedKey = true
      this.cryptoKeyRing[this.currentKeyIndex] = { encryptionKey: keys };
    } else {
      this.cryptoKeyRing[this.currentKeyIndex] = keys;
    }

    // this._sendCount = BigInt(0); // eslint-disable-line new-cap
  }

  /**
   * Function that will be injected in a stream and will encrypt the given encoded frames.
   *
   * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
   * @param {TransformStreamDefaultController} controller - TransportStreamController.
   *
   * The VP8 payload descriptor described in
   * https://tools.ietf.org/html/rfc7741#section-4.2
   * is part of the RTP packet and not part of the frame and is not controllable by us.
   * This is fine as the SFU keeps having access to it for routing.
   *
   * The encrypted frame is formed as follows:
   * 1) Leave the first (10, 3, 1) bytes unencrypted, depending on the frame type and kind.
   * 2) Form the GCM IV for the frame as described above.
   * 3) Encrypt the rest of the frame using AES-GCM.
   * 4) Allocate space for the encrypted frame.
   * 5) Copy the unencrypted bytes to the start of the encrypted frame.
   * 6) Append the ciphertext to the encrypted frame.
   * 7) Append the IV.
   * 8) Append a single byte for the key identifier.
   * 9) Enqueue the encrypted frame for sending.
   */
  async encodeFunction(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    controller: TransformStreamDefaultController,
  ) {
    const keyIndex = this.currentKeyIndex;

    const encryptionKey = this.cryptoKeyRing[keyIndex]?.encryptionKey;

    if (encryptionKey) {
      const iv = this.makeIV(
        encodedFrame.getMetadata().synchronizationSource ?? -1,
        encodedFrame.timestamp,
      );

      // Thіs is not encrypted and contains the VP8 payload descriptor or the Opus TOC byte.
      const frameHeader = new Uint8Array(encodedFrame.data, 0, getHeaderBytes(encodedFrame));

      // Frame trailer contains the R|IV_LENGTH and key index
      const frameTrailer = new Uint8Array(2);

      frameTrailer[0] = IV_LENGTH;
      frameTrailer[1] = keyIndex;

      // Construct frame trailer. Similar to the frame header described in
      // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.2
      // but we put it at the end.
      //
      // ---------+-------------------------+-+---------+----
      // payload  |IV...(length = IV_LENGTH)|R|IV_LENGTH|KID |
      // ---------+-------------------------+-+---------+----

      return crypto.subtle
        .encrypt(
          {
            name: ENCRYPTION_ALGORITHM,
            iv,
            additionalData: new Uint8Array(encodedFrame.data, 0, frameHeader.byteLength),
          },
          encryptionKey,
          new Uint8Array(encodedFrame.data, getHeaderBytes(encodedFrame)),
        )
        .then(
          (cipherText) => {
            const newData = new ArrayBuffer(
              frameHeader.byteLength +
                cipherText.byteLength +
                iv.byteLength +
                frameTrailer.byteLength,
            );
            const newUint8 = new Uint8Array(newData);

            newUint8.set(frameHeader); // copy first bytes.
            newUint8.set(new Uint8Array(cipherText), frameHeader.byteLength); // add ciphertext.
            newUint8.set(new Uint8Array(iv), frameHeader.byteLength + cipherText.byteLength); // append IV.
            newUint8.set(
              frameTrailer,
              frameHeader.byteLength + cipherText.byteLength + iv.byteLength,
            ); // append frame trailer.

            encodedFrame.data = newData;

            return controller.enqueue(encodedFrame);
          },
          (e) => {
            // TODO: surface this to the app.
            workerLogger.error(e);
          },
        );
    }

    /* NOTE WELL:
     * This will send unencrypted data (only protected by DTLS transport encryption) when no key is configured.
     * This is ok for demo purposes but should not be done once this becomes more relied upon.
     */
    return controller.enqueue(encodedFrame);
  }

  /**
   * Function that will be injected in a stream and will decrypt the given encoded frames.
   *
   * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
   * @param {TransformStreamDefaultController} controller - TransportStreamController.
   */
  async decodeFunction(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    controller: TransformStreamDefaultController,
  ) {
    const data = new Uint8Array(encodedFrame.data);
    const keyIndex = data[encodedFrame.data.byteLength - 1];

    if (this.cryptoKeyRing[keyIndex]) {
      try {
        const decodedFrame = await this.decryptFrame(encodedFrame, keyIndex);
        return controller.enqueue(decodedFrame);
      } catch (error) {
        workerLogger.warn('decoding frame failed, enqueuing frame as is');
      }
    }

    return controller.enqueue(encodedFrame);
  }

  /**
   * Function that will decrypt the given encoded frame. If the decryption fails, it will
   * ratchet the key for up to RATCHET_WINDOW_SIZE times.
   */
  async decryptFrame(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    keyIndex: number,
    initialKey: KeySet | undefined = undefined,
    ratchetCount: number = 0,
  ): Promise<RTCEncodedVideoFrame | RTCEncodedAudioFrame> {
    const encryptionKey = this.cryptoKeyRing[keyIndex].encryptionKey;

    // Construct frame trailer. Similar to the frame header described in
    // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.2
    // but we put it at the end.
    //
    // ---------+-------------------------+-+---------+----
    // payload  |IV...(length = IV_LENGTH)|R|IV_LENGTH|KID |
    // ---------+-------------------------+-+---------+----

    try {
      const frameHeader = new Uint8Array(encodedFrame.data, 0, getHeaderBytes(encodedFrame));
      const frameTrailer = new Uint8Array(encodedFrame.data, encodedFrame.data.byteLength - 2, 2);

      const ivLength = frameTrailer[0];
      const iv = new Uint8Array(
        encodedFrame.data,
        encodedFrame.data.byteLength - ivLength - frameTrailer.byteLength,
        ivLength,
      );

      const cipherTextStart = frameHeader.byteLength;
      const cipherTextLength =
        encodedFrame.data.byteLength -
        (frameHeader.byteLength + ivLength + frameTrailer.byteLength);

      const plainText = await crypto.subtle.decrypt(
        {
          name: ENCRYPTION_ALGORITHM,
          iv,
          additionalData: new Uint8Array(encodedFrame.data, 0, frameHeader.byteLength),
        },
        encryptionKey,
        new Uint8Array(encodedFrame.data, cipherTextStart, cipherTextLength),
      );

      const newData = new ArrayBuffer(frameHeader.byteLength + plainText.byteLength);
      const newUint8 = new Uint8Array(newData);

      newUint8.set(new Uint8Array(encodedFrame.data, 0, frameHeader.byteLength));
      newUint8.set(new Uint8Array(plainText), frameHeader.byteLength);

      encodedFrame.data = newData;

      return encodedFrame;
    } catch (error) {
      let { material } = this.cryptoKeyRing[keyIndex];

      if (this.sharedKey || !material) {
        throw error;
      }

      if (ratchetCount < RATCHET_WINDOW_SIZE) {
        const currentKey = this.cryptoKeyRing[this.currentKeyIndex];

        material = await importKey(await ratchet(material));

        const newKey = await deriveKeys(material);

        this.setKeys(newKey);

        return await this.decryptFrame(
          encodedFrame,
          keyIndex,
          initialKey || currentKey,
          ratchetCount + 1,
        );
      }

      /**
       * Since the key it is first send and only afterwards actually used for encrypting, there were
       * situations when the decrypting failed due to the fact that the received frame was not encrypted
       * yet and ratcheting, of course, did not solve the problem. So if we fail RATCHET_WINDOW_SIZE times,
       * we come back to the initial key.
       */
      if (initialKey) {
        this.setKeys(initialKey);
      }

      throw error;
      // TODO: notify the application about error status.
    }
  }

  /**
   * Construct the IV used for AES-GCM and sent (in plain) with the packet similar to
   * https://tools.ietf.org/html/rfc7714#section-8.1
   * It concatenates
   * - the 32 bit synchronization source (SSRC) given on the encoded frame,
   * - the 32 bit rtp timestamp given on the encoded frame,
   * - a send counter that is specific to the SSRC. Starts at a random number.
   * The send counter is essentially the pictureId but we currently have to implement this ourselves.
   * There is no XOR with a salt. Note that this IV leaks the SSRC to the receiver but since this is
   * randomly generated and SFUs may not rewrite this is considered acceptable.
   * The SSRC is used to allow demultiplexing multiple streams with the same key, as described in
   *   https://tools.ietf.org/html/rfc3711#section-4.1.1
   * The RTP timestamp is 32 bits and advances by the codec clock rate (90khz for video, 48khz for
   * opus audio) every second. For video it rolls over roughly every 13 hours.
   * The send counter will advance at the frame rate (30fps for video, 50fps for 20ms opus audio)
   * every second. It will take a long time to roll over.
   *
   * See also https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams
   */
  private makeIV(synchronizationSource: number, timestamp: number) {
    const iv = new ArrayBuffer(IV_LENGTH);
    const ivView = new DataView(iv);

    // having to keep our own send count (similar to a picture id) is not ideal.
    if (!this.sendCounts.has(synchronizationSource)) {
      // Initialize with a random offset, similar to the RTP sequence number.
      this.sendCounts.set(synchronizationSource, Math.floor(Math.random() * 0xffff));
    }

    const sendCount = this.sendCounts.get(synchronizationSource) ?? 0;

    ivView.setUint32(0, synchronizationSource);
    ivView.setUint32(4, timestamp);
    ivView.setUint32(8, sendCount % 0xffff);

    this.sendCounts.set(synchronizationSource, sendCount + 1);

    return iv;
  }
}

function getHeaderBytes(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame) {
  return UNENCRYPTED_BYTES[isVideoFrame(frame) ? frame.type : 'audio'];
}
