// TODO code inspired by https://github.com/webrtc/samples/blob/gh-pages/src/content/insertable-streams/endtoend-encryption/js/worker.js

import { KEYRING_SIZE, UNENCRYPTED_BYTES } from './constants';
import { isVideoFrame } from './utils';

/**
 * Per-participant cipher holding the cryptographic keys and
 * encode/decode functions
 */
export class Cipher {
  private currentKeyIndex: number;

  private cryptoKeyRing: Array<string>;

  private currentKeyIdentifier: number = 0;

  private get currentKey() {
    return this.cryptoKeyRing[this.currentKeyIndex];
  }

  // private sendCounts: Map<number, number>;

  constructor() {
    this.currentKeyIndex = 0;
    this.cryptoKeyRing = new Array(KEYRING_SIZE);
    // this.sendCounts = new Map();
  }

  async setKey(key: string, keyIndex: number = -1) {
    // const cryptoKey = await crypto.subtle.importKey('jwk', key, ENCRYPTION_ALGORITHM, false, [
    //   'encrypt',
    //   'decrypt',
    // ]);
    if (keyIndex >= 0) {
      this.currentKeyIndex = keyIndex % this.cryptoKeyRing.length;
    }
    this.cryptoKeyRing[this.currentKeyIndex] = key;
    console.log('e2ee: successfully set key', this.cryptoKeyRing);
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
  encodeFunction(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    controller: TransformStreamDefaultController,
  ) {
    if (this.currentKey) {
      const view = new DataView(encodedFrame.data);
      // Any length that is needed can be used for the new buffer.
      const newData = new ArrayBuffer(encodedFrame.data.byteLength + 5);
      const newView = new DataView(newData);

      const cryptoOffset = getHeaderBytes(encodedFrame);
      for (let i = 0; i < cryptoOffset && i < encodedFrame.data.byteLength; ++i) {
        newView.setInt8(i, view.getInt8(i));
      }
      // This is a bitwise xor of the key with the payload. This is not strong encryption, just a demo.
      for (let i = cryptoOffset; i < encodedFrame.data.byteLength; ++i) {
        const keyByte = this.currentKey.charCodeAt(i % this.currentKey.length);
        newView.setInt8(i, view.getInt8(i) ^ keyByte);
      }
      // Append keyIdentifier.
      newView.setUint8(encodedFrame.data.byteLength, this.currentKeyIdentifier % 0xff);
      // Append checksum
      newView.setUint32(encodedFrame.data.byteLength + 1, 0xdeadbeef);

      encodedFrame.data = newData;
    } else {
      console.warn('not using e2ee: encode');
    }
    controller.enqueue(encodedFrame);
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
    const view = new DataView(encodedFrame.data);
    const checksum =
      encodedFrame.data.byteLength > 4 ? view.getUint32(encodedFrame.data.byteLength - 4) : false;
    if (this.currentKey) {
      if (checksum !== 0xdeadbeef) {
        console.log('Corrupted frame received, checksum ' + checksum.toString(16));
        return; // This can happen when the key is set and there is an unencrypted frame in-flight.
      }
      const keyIdentifier = view.getUint8(encodedFrame.data.byteLength - 5);
      if (keyIdentifier !== this.currentKeyIdentifier) {
        console.log(
          `Key identifier mismatch, got ${keyIdentifier} expected ${this.currentKeyIdentifier}.`,
        );
        return;
      }

      const newData = new ArrayBuffer(encodedFrame.data.byteLength - 5);
      const newView = new DataView(newData);
      const cryptoOffset = getHeaderBytes(encodedFrame);

      for (let i = 0; i < cryptoOffset; ++i) {
        newView.setInt8(i, view.getInt8(i));
      }
      for (let i = cryptoOffset; i < encodedFrame.data.byteLength - 5; ++i) {
        const keyByte = this.currentKey.charCodeAt(i % this.currentKey.length);
        newView.setInt8(i, view.getInt8(i) ^ keyByte);
      }
      encodedFrame.data = newData;
    } else if (checksum === 0xdeadbeef) {
      console.warn('no key, decode');
      return; // encrypted in-flight frame but we already forgot about the key.
    } else {
      console.warn('not using e2ee: decode');
    }
    controller.enqueue(encodedFrame);
  }
}

/**
 * Function that will decrypt the given encoded frame. If the decryption fails, it will
 * ratchet the key for up to RATCHET_WINDOW_SIZE times.
 *
 */
// private async decryptFrame(
//   encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
//   keyIndex: number,
// ): Promise<RTCEncodedVideoFrame | RTCEncodedAudioFrame> {
//   const encryptionKey = this.cryptoKeyRing[keyIndex];

//   // Construct frame trailer. Similar to the frame header described in
//   // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.2
//   // but we put it at the end.
//   //
//   // ---------+-------------------------+-+---------+----
//   // payload  |IV...(length = IV_LENGTH)|R|IV_LENGTH|KID |
//   // ---------+-------------------------+-+---------+----

//   try {
//     const frameHeader = new Uint8Array(encodedFrame.data, 0, getHeaderBytes(encodedFrame));
//     const frameTrailer = new Uint8Array(encodedFrame.data, encodedFrame.data.byteLength - 2, 2);

//     const ivLength = frameTrailer[0];
//     const iv = new Uint8Array(
//       encodedFrame.data,
//       encodedFrame.data.byteLength - ivLength - frameTrailer.byteLength,
//       ivLength,
//     );

//     // console.log(iv);

//     const cipherTextStart = frameHeader.byteLength;
//     const cipherTextLength =
//       encodedFrame.data.byteLength -
//       (frameHeader.byteLength + ivLength + frameTrailer.byteLength);

//     const plainText = await crypto.subtle.decrypt(
//       {
//         name: ENCRYPTION_ALGORITHM,
//         iv,
//         additionalData: new Uint8Array(encodedFrame.data, 0, frameHeader.byteLength),
//       },
//       this.currentKey,
//       new Uint8Array(encodedFrame.data, cipherTextStart, cipherTextLength),
//     );

//     const newData = new ArrayBuffer(frameHeader.byteLength + plainText.byteLength);
//     const newUint8 = new Uint8Array(newData);

//     newUint8.set(new Uint8Array(encodedFrame.data, 0, frameHeader.byteLength));
//     newUint8.set(new Uint8Array(plainText), frameHeader.byteLength);

//     encodedFrame.data = newData;
//   } catch (error) {
//     console.error(error);
//   }

//   return encodedFrame;
// }

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
//   private makeIV(synchronizationSource: number, timestamp: number) {
//     const iv = new ArrayBuffer(IV_LENGTH);
//     const ivView = new DataView(iv);

//     // having to keep our own send count (similar to a picture id) is not ideal.
//     if (!this.sendCounts.has(synchronizationSource)) {
//       // Initialize with a random offset, similar to the RTP sequence number.
//       this.sendCounts.set(synchronizationSource, Math.floor(Math.random() * 0xffff));
//     }

//     const sendCount = this.sendCounts.get(synchronizationSource) ?? 0;

//     ivView.setUint32(0, synchronizationSource);
//     ivView.setUint32(4, timestamp);
//     ivView.setUint32(8, sendCount % 0xffff);

//     this.sendCounts.set(synchronizationSource, sendCount + 1);

//     return iv;
//   }
// }

function getHeaderBytes(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame) {
  return UNENCRYPTED_BYTES[isVideoFrame(frame) ? frame.type : 'audio'];
}
