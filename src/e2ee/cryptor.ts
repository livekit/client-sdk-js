/* eslint-disable @typescript-eslint/no-unused-vars */
// TODO code inspired by https://github.com/webrtc/samples/blob/gh-pages/src/content/insertable-streams/endtoend-encryption/js/worker.js

import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { setLogLevel, workerLogger } from '../logger';
import { ENCRYPTION_ALGORITHM, IV_LENGTH, KEYRING_SIZE, UNENCRYPTED_BYTES } from './constants';
import { E2EEError, E2EEErrorReason } from './errors';
import { CryptorCallbacks, CryptorEvent, ErrorMessage } from './types';
import { isVideoFrame } from './utils';

export interface CryptorConstructor {
  new (opts?: unknown): BaseCryptor;
}

export interface TransformerInfo {
  readable: ReadableStream;
  writable: WritableStream;
  transformer: TransformStream;
  abortController: AbortController;
}

export class BaseCryptor extends (EventEmitter as new () => TypedEmitter<CryptorCallbacks>) {
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
 * Per-track cryptor holding
 * encode/decode functions
 */
export class Cryptor extends BaseCryptor {
  private sendCounts: Map<number, number>;

  private useSharedKey: boolean | undefined;

  private isKeyInvalid = false;

  private participantId: string | undefined;

  private trackId: string | undefined;

  private keys: ParticipantKeys;

  private codec: string = 'vp8';

  constructor(opts: {
    sharedKey?: boolean;
    // enabled?: boolean;
    keys: ParticipantKeys;
    participantId: string;
  }) {
    super();
    this.sendCounts = new Map();
    this.useSharedKey = opts.sharedKey;
    this.keys = opts.keys;
    this.participantId = opts.participantId;
  }

  setParticipant(id: string, keys: ParticipantKeys) {
    this.participantId = id;
    this.keys = keys;
  }

  unsetParticipant() {
    this.participantId = undefined;
  }

  getParticipantId() {
    return this.participantId;
  }

  getTrackId() {
    return this.trackId;
  }

  setCodec(codec: string) {
    this.codec = codec;
  }

  setupTransform(
    operation: 'encode' | 'decode',
    readable: ReadableStream,
    writable: WritableStream,
    trackId: string,
    codec?: string,
  ) {
    if (codec) {
      console.info('setting codec on cryptor to', codec);
      this.codec = codec;
    }
    const transformFn = operation === 'encode' ? this.encodeFunction : this.decodeFunction;
    const transformStream = new TransformStream({
      transform: transformFn.bind(this),
    });

    readable
      .pipeThrough(transformStream)
      .pipeTo(writable)
      .catch((e) => {
        const errorMsg: ErrorMessage = {
          kind: 'error',
          data: {
            error: new E2EEError(e.message, E2EEErrorReason.InternalError),
          },
        };
        postMessage(errorMsg);
        workerLogger.error(e);
      });
    this.trackId = trackId;
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
    if (
      !this.keys.isEnabled() ||
      // skip for encryption for empty dtx frames
      encodedFrame.data.byteLength === 0
    ) {
      return controller.enqueue(encodedFrame);
    }

    const encryptionKey = this.keys.getKey();
    const keyIndex = this.keys.getCurrentKeyIndex();

    if (encryptionKey) {
      const iv = this.makeIV(
        encodedFrame.getMetadata().synchronizationSource ?? -1,
        encodedFrame.timestamp,
      );

      // Thіs is not encrypted and contains the VP8 payload descriptor or the Opus TOC byte.
      const frameHeader = new Uint8Array(
        encodedFrame.data,
        0,
        getUnencryptedBytes(encodedFrame, this.codec),
      );

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
      try {
        const cipherText = await crypto.subtle.encrypt(
          {
            name: ENCRYPTION_ALGORITHM,
            iv,
            additionalData: new Uint8Array(encodedFrame.data, 0, frameHeader.byteLength),
          },
          encryptionKey,
          new Uint8Array(encodedFrame.data, getUnencryptedBytes(encodedFrame, this.codec)),
        );

        const newData = new ArrayBuffer(
          frameHeader.byteLength + cipherText.byteLength + iv.byteLength + frameTrailer.byteLength,
        );
        const newUint8 = new Uint8Array(newData);

        newUint8.set(frameHeader); // copy first bytes.
        newUint8.set(new Uint8Array(cipherText), frameHeader.byteLength); // add ciphertext.
        newUint8.set(new Uint8Array(iv), frameHeader.byteLength + cipherText.byteLength); // append IV.
        newUint8.set(frameTrailer, frameHeader.byteLength + cipherText.byteLength + iv.byteLength); // append frame trailer.

        encodedFrame.data = newData;

        return controller.enqueue(encodedFrame);
      } catch (e: any) {
        // TODO: surface this to the app.
        workerLogger.error(e);
      }
    } else {
      this.emit(
        CryptorEvent.Error,
        new E2EEError(`encryption key missing for encoding`, E2EEErrorReason.MissingKey),
      );
      // workerLogger.debug('skipping frame encryption');
    }
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
    if (
      !this.keys.isEnabled() ||
      // skip for decryption for empty dtx frames
      encodedFrame.data.byteLength === 0
    ) {
      return controller.enqueue(encodedFrame);
    }
    const data = new Uint8Array(encodedFrame.data);
    const keyIndex = data[encodedFrame.data.byteLength - 1];

    if (this.keys.getKey(keyIndex)) {
      try {
        const decodedFrame = await this.decryptFrame(encodedFrame, keyIndex, this.codec);
        if (decodedFrame) {
          return controller.enqueue(decodedFrame);
        }
        this.isKeyInvalid = false;
      } catch (error) {
        if (error instanceof E2EEError && error.reason === E2EEErrorReason.InvalidKey) {
          if (!this.isKeyInvalid) {
            workerLogger.warn('invalid key');
            this.emit(
              CryptorEvent.Error,
              new E2EEError(
                `invalid key for participant ${this.participantId}`,
                E2EEErrorReason.InvalidKey,
              ),
            );
            this.isKeyInvalid = true;
          }
        } else {
          workerLogger.warn('decoding frame failed', { error });
        }
      }
    } else {
      this.emit(
        CryptorEvent.Error,
        new E2EEError(
          `key missing for participant ${this.participantId}`,
          E2EEErrorReason.MissingKey,
        ),
      );
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
    codec?: string,
    initialKey: CryptoKey | undefined = undefined,
  ): Promise<RTCEncodedVideoFrame | RTCEncodedAudioFrame | undefined> {
    const encryptionKey = this.keys.getKey(keyIndex);

    // Construct frame trailer. Similar to the frame header described in
    // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.2
    // but we put it at the end.
    //
    // ---------+-------------------------+-+---------+----
    // payload  |IV...(length = IV_LENGTH)|R|IV_LENGTH|KID |
    // ---------+-------------------------+-+---------+----

    try {
      const frameHeader = new Uint8Array(
        encodedFrame.data,
        0,
        getUnencryptedBytes(encodedFrame, codec),
      );
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
    } catch (error: any) {
      workerLogger.error(error);
      throw new E2EEError('Got invalid key when trying to decode', E2EEErrorReason.InvalidKey);
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
    ivView.setUint32(8, timestamp - (sendCount % 0xffff));

    this.sendCounts.set(synchronizationSource, sendCount + 1);

    return iv;
  }
}

function getUnencryptedBytes(
  frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
  codec?: string,
): number {
  if (isVideoFrame(frame)) {
    switch (codec) {
      case 'h264':
        // TODO avoid creating a new array each time, the array is already being created in the encode/decode functions
        let data = new Uint8Array(frame.data);
        let naluIndices = findNALUIndices(data);
        console.log(
          'nalus',
          naluIndices.map((i) => parseNALUType(data[i])),
        );
        for (const index of naluIndices) {
          let type = parseNALUType(data[index]);
          switch (type) {
            case NALUType.SLICE_IDR:
            case NALUType.SLICE_NON_IDR:
            case NALUType.SLICE_PARTITION_B:
              return index + 2;
            default:
              console.log('found nalu', type);
              break;
          }
        }
        throw new E2EEError('Could not find NALU');
      default:
        return UNENCRYPTED_BYTES[frame.type];
    }
  } else {
    return UNENCRYPTED_BYTES.audio;
  }
}

/**
 * Slice the NALUs present in the supplied buffer, assuming it is already byte-aligned
 * code adapted from https://github.com/medooze/h264-frame-parser/blob/main/lib/NalUnits.ts to return indices only
 */
export function findNALUIndices(stream: Uint8Array): number[] {
  const result: number[] = [];
  let start = 0,
    pos = 0,
    searchLength = stream.length - 2;
  while (pos < searchLength) {
    // skip until end of current NALU
    while (
      pos < searchLength &&
      !(stream[pos] === 0 && stream[pos + 1] === 0 && stream[pos + 2] === 1)
    )
      pos++;
    if (pos >= searchLength) pos = stream.length;
    // remove trailing zeros from current NALU
    let end = pos;
    while (end > start && stream[end - 1] === 0) end--;
    // save current NALU
    if (start === 0) {
      if (end !== start) throw TypeError('byte stream contains leading data');
    } else {
      result.push(start);
    }
    // begin new NALU
    start = pos = pos + 3;
  }
  return result;
}

export function parseNALUType(startByte: number): NALUType {
  return startByte & kNaluTypeMask;
}

const kNaluTypeMask = 0x1f;

export enum NALUType {
  /** Coded slice of a non-IDR picture */
  SLICE_NON_IDR = 1,
  /** Coded slice data partition A */
  SLICE_PARTITION_A = 2,
  /** Coded slice data partition B */
  SLICE_PARTITION_B = 3,
  /** Coded slice data partition C */
  SLICE_PARTITION_C = 4,
  /** Coded slice of an IDR picture */
  SLICE_IDR = 5,
  /** Supplemental enhancement information */
  SEI = 6,
  /** Sequence parameter set */
  SPS = 7,
  /** Picture parameter set */
  PPS = 8,
  /** Access unit delimiter */
  AUD = 9,
  /** End of sequence */
  END_SEQ = 10,
  /** End of stream */
  END_STREAM = 11,
  /** Filler data */
  FILLER_DATA = 12,
  /** Sequence parameter set extension */
  SPS_EXT = 13,
  /** Prefix NAL unit */
  PREFIX_NALU = 14,
  /** Subset sequence parameter set */
  SUBSET_SPS = 15,
  /** Depth parameter set */
  DPS = 16,

  // 17, 18 reserved

  /** Coded slice of an auxiliary coded picture without partitioning */
  SLICE_AUX = 19,
  /** Coded slice extension */
  SLICE_EXT = 20,
  /** Coded slice extension for a depth view component or a 3D-AVC texture view component */
  SLICE_LAYER_EXT = 21,

  // 22, 23 reserved
}

export class ParticipantKeys {
  private currentKeyIndex: number;

  private cryptoKeyRing: Array<CryptoKey>;

  private enabled: boolean;

  constructor(isEnabled = true) {
    this.currentKeyIndex = 0;
    this.cryptoKeyRing = new Array(KEYRING_SIZE);
    this.enabled = isEnabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  async setKey(key: CryptoKey, keyIndex = 0) {
    // if (key) {
    //   let newKey: CryptoKey;
    //   if (this.isSharedKey) {
    //     newKey = await crypto.subtle.importKey(
    //       'raw',
    //       key,
    //       {
    //         name: ENCRYPTION_ALGORITHM,
    //         length: 256,
    //       },
    //       false,
    //       ['encrypt', 'decrypt'],
    //     );
    //   } else {
    //     const material = await importKey(key);
    //     newKey = await deriveKeys(material);
    //   }
    workerLogger.debug('setting new key');
    if (keyIndex >= 0) {
      this.currentKeyIndex = keyIndex % this.cryptoKeyRing.length;
    }
    this.cryptoKeyRing[this.currentKeyIndex] = key;
    // }
  }

  isEnabled() {
    return this.enabled;
  }

  getCurrentKeyIndex() {
    return this.currentKeyIndex;
  }

  getKey(keyIndex?: number) {
    return this.cryptoKeyRing[keyIndex ?? this.currentKeyIndex];
  }
}
