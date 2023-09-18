/* eslint-disable @typescript-eslint/no-unused-vars */
// TODO code inspired by https://github.com/webrtc/samples/blob/gh-pages/src/content/insertable-streams/endtoend-encryption/js/worker.js
import { EventEmitter } from 'events';
import type TypedEventEmitter from 'typed-emitter';
import { workerLogger } from '../../logger';
import type { VideoCodec } from '../../room/track/options';
import { ENCRYPTION_ALGORITHM, IV_LENGTH, UNENCRYPTED_BYTES } from '../constants';
import { CryptorError, CryptorErrorReason } from '../errors';
import { CryptorCallbacks, CryptorEvent } from '../events';
import type { DecodeRatchetOptions, KeyProviderOptions, KeySet } from '../types';
import { deriveKeys, isVideoFrame } from '../utils';
import type { ParticipantKeyHandler } from './ParticipantKeyHandler';
import { SifGuard } from './SifGuard';

export const encryptionEnabledMap: Map<string, boolean> = new Map();

export interface FrameCryptorConstructor {
  new (opts?: unknown): BaseFrameCryptor;
}

export interface TransformerInfo {
  readable: ReadableStream;
  writable: WritableStream;
  transformer: TransformStream;
  abortController: AbortController;
}

export class BaseFrameCryptor extends (EventEmitter as new () => TypedEventEmitter<CryptorCallbacks>) {
  protected encodeFunction(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    controller: TransformStreamDefaultController,
  ): Promise<any> {
    throw Error('not implemented for subclass');
  }

  protected decodeFunction(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    controller: TransformStreamDefaultController,
  ): Promise<any> {
    throw Error('not implemented for subclass');
  }
}

/**
 * Cryptor is responsible for en-/decrypting media frames.
 * Each Cryptor instance is responsible for en-/decrypting a single mediaStreamTrack.
 */
export class FrameCryptor extends BaseFrameCryptor {
  private sendCounts: Map<number, number>;

  private participantIdentity: string | undefined;

  private trackId: string | undefined;

  private keys: ParticipantKeyHandler;

  private videoCodec?: VideoCodec;

  private rtpMap: Map<number, VideoCodec>;

  private keyProviderOptions: KeyProviderOptions;

  /**
   * used for detecting server injected unencrypted frames
   */
  private sifTrailer: Uint8Array;

  private sifGuard: SifGuard;

  constructor(opts: {
    keys: ParticipantKeyHandler;
    participantIdentity: string;
    keyProviderOptions: KeyProviderOptions;
    sifTrailer?: Uint8Array;
  }) {
    super();
    this.sendCounts = new Map();
    this.keys = opts.keys;
    this.participantIdentity = opts.participantIdentity;
    this.rtpMap = new Map();
    this.keyProviderOptions = opts.keyProviderOptions;
    this.sifTrailer = opts.sifTrailer ?? Uint8Array.from([]);
    this.sifGuard = new SifGuard();
  }

  /**
   * Assign a different participant to the cryptor.
   * useful for transceiver re-use
   * @param id
   * @param keys
   */
  setParticipant(id: string, keys: ParticipantKeyHandler) {
    this.participantIdentity = id;
    this.keys = keys;
    this.sifGuard.reset();
  }

  unsetParticipant() {
    this.participantIdentity = undefined;
  }

  isEnabled() {
    if (this.participantIdentity) {
      return encryptionEnabledMap.get(this.participantIdentity);
    } else {
      return undefined;
    }
  }

  getParticipantIdentity() {
    return this.participantIdentity;
  }

  getTrackId() {
    return this.trackId;
  }

  /**
   * Update the video codec used by the mediaStreamTrack
   * @param codec
   */
  setVideoCodec(codec: VideoCodec) {
    this.videoCodec = codec;
  }

  /**
   * rtp payload type map used for figuring out codec of payload type when encoding
   * @param map
   */
  setRtpMap(map: Map<number, VideoCodec>) {
    this.rtpMap = map;
  }

  setupTransform(
    operation: 'encode' | 'decode',
    readable: ReadableStream,
    writable: WritableStream,
    trackId: string,
    codec?: VideoCodec,
  ) {
    if (codec) {
      workerLogger.info('setting codec on cryptor to', { codec });
      this.videoCodec = codec;
    }

    const transformFn = operation === 'encode' ? this.encodeFunction : this.decodeFunction;
    const transformStream = new TransformStream({
      transform: transformFn.bind(this),
    });

    readable
      .pipeThrough(transformStream)
      .pipeTo(writable)
      .catch((e) => {
        workerLogger.warn(e);
        this.emit(CryptorEvent.Error, e instanceof CryptorError ? e : new CryptorError(e.message));
      });
    this.trackId = trackId;
  }

  setSifTrailer(trailer: Uint8Array) {
    this.sifTrailer = trailer;
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
   * 1) Find unencrypted byte length, depending on the codec, frame type and kind.
   * 2) Form the GCM IV for the frame as described above.
   * 3) Encrypt the rest of the frame using AES-GCM.
   * 4) Allocate space for the encrypted frame.
   * 5) Copy the unencrypted bytes to the start of the encrypted frame.
   * 6) Append the ciphertext to the encrypted frame.
   * 7) Append the IV.
   * 8) Append a single byte for the key identifier.
   * 9) Enqueue the encrypted frame for sending.
   */
  protected async encodeFunction(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    controller: TransformStreamDefaultController,
  ) {
    if (
      !this.isEnabled() ||
      // skip for encryption for empty dtx frames
      encodedFrame.data.byteLength === 0
    ) {
      return controller.enqueue(encodedFrame);
    }
    const keySet = this.keys.getKeySet();
    if (!keySet) {
      throw new TypeError(
        `key set not found for ${
          this.participantIdentity
        } at index ${this.keys.getCurrentKeyIndex()}`,
      );
    }
    const { encryptionKey } = keySet;
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
        this.getUnencryptedBytes(encodedFrame),
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
          new Uint8Array(encodedFrame.data, this.getUnencryptedBytes(encodedFrame)),
        );

        var newDataWitoutHeader = new Uint8Array(cipherText.byteLength + iv.byteLength + frameTrailer.byteLength);
        newDataWitoutHeader.set(new Uint8Array(cipherText)); // add ciphertext.
        newDataWitoutHeader.set(new Uint8Array(iv), cipherText.byteLength); // append IV.
        newDataWitoutHeader.set(frameTrailer, cipherText.byteLength + iv.byteLength); // append frame trailer.

        if(isVideoFrame(encodedFrame) && this.frameIsH264(encodedFrame)) {
          newDataWitoutHeader = WriteRbsp(newDataWitoutHeader);
        }

        var newData = new Uint8Array(frameHeader.byteLength + newDataWitoutHeader.byteLength);
        newData.set(frameHeader);
        newData.set(newDataWitoutHeader, frameHeader.byteLength);

        encodedFrame.data = newData.buffer;

        return controller.enqueue(encodedFrame);
      } catch (e: any) {
        // TODO: surface this to the app.
        workerLogger.error(e);
      }
    } else {
      this.emit(
        CryptorEvent.Error,
        new CryptorError(`encryption key missing for encoding`, CryptorErrorReason.MissingKey),
      );
    }
  }

  /**
   * Function that will be injected in a stream and will decrypt the given encoded frames.
   *
   * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
   * @param {TransformStreamDefaultController} controller - TransportStreamController.
   */
  protected async decodeFunction(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    controller: TransformStreamDefaultController,
  ) {
    if (
      !this.isEnabled() ||
      // skip for decryption for empty dtx frames
      encodedFrame.data.byteLength === 0
    ) {
      this.sifGuard.recordUserFrame();
      return controller.enqueue(encodedFrame);
    }

    if (isFrameServerInjected(encodedFrame.data, this.sifTrailer)) {
      this.sifGuard.recordSif();

      if (this.sifGuard.isSifAllowed()) {
        encodedFrame.data = encodedFrame.data.slice(
          0,
          encodedFrame.data.byteLength - this.sifTrailer.byteLength,
        );
        return controller.enqueue(encodedFrame);
      } else {
        workerLogger.warn('SIF limit reached, dropping frame');
        return;
      }
    } else {
      this.sifGuard.recordUserFrame();
    }
    const data = new Uint8Array(encodedFrame.data);
    const keyIndex = data[encodedFrame.data.byteLength - 1];

    if (this.keys.getKeySet(keyIndex) && this.keys.hasValidKey) {
      try {
        const decodedFrame = await this.decryptFrame(encodedFrame, keyIndex);
        this.keys.decryptionSuccess();
        if (decodedFrame) {
          return controller.enqueue(decodedFrame);
        }
      } catch (error) {
        if (error instanceof CryptorError && error.reason === CryptorErrorReason.InvalidKey) {
          if (this.keys.hasValidKey) {
            this.emit(CryptorEvent.Error, error);
            this.keys.decryptionFailure();
          }
        } else {
          workerLogger.warn('decoding frame failed', { error });
        }
      }
    } else if (!this.keys.getKeySet(keyIndex) && this.keys.hasValidKey) {
      // emit an error in case the key index is out of bounds but the key handler thinks we still have a valid key
      workerLogger.warn('skipping decryption due to missing key at index');
      this.emit(
        CryptorEvent.Error,
        new CryptorError(
          `missing key at index for participant ${this.participantIdentity}`,
          CryptorErrorReason.MissingKey,
        ),
      );
    }
  }

  /**
   * Function that will decrypt the given encoded frame. If the decryption fails, it will
   * ratchet the key for up to RATCHET_WINDOW_SIZE times.
   */
  private async decryptFrame(
    encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
    keyIndex: number,
    initialMaterial: KeySet | undefined = undefined,
    ratchetOpts: DecodeRatchetOptions = { ratchetCount: 0 },
  ): Promise<RTCEncodedVideoFrame | RTCEncodedAudioFrame | undefined> {
    const keySet = this.keys.getKeySet(keyIndex);
    if (!ratchetOpts.encryptionKey && !keySet) {
      throw new TypeError(`no encryption key found for decryption of ${this.participantIdentity}`);
    }

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
        this.getUnencryptedBytes(encodedFrame),
      );
      var encryptedData = new Uint8Array(encodedFrame.data, frameHeader.length, encodedFrame.data.byteLength - frameHeader.length);
      if(isVideoFrame(encodedFrame) && this.frameIsH264(encodedFrame) && needsRbspUnescaping(encryptedData)) {
        encryptedData = ParseRbsp(encryptedData);
        const newUint8 = new Uint8Array(frameHeader.byteLength + encryptedData.byteLength);
        newUint8.set(frameHeader);
        newUint8.set(encryptedData, frameHeader.byteLength);
        encodedFrame.data = newUint8.buffer;
      }

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
        ratchetOpts.encryptionKey ?? keySet!.encryptionKey,
        new Uint8Array(encodedFrame.data, cipherTextStart, cipherTextLength),
      );

      const newData = new ArrayBuffer(frameHeader.byteLength + plainText.byteLength);
      const newUint8 = new Uint8Array(newData);

      newUint8.set(new Uint8Array(encodedFrame.data, 0, frameHeader.byteLength));
      newUint8.set(new Uint8Array(plainText), frameHeader.byteLength);

      encodedFrame.data = newData;

      return encodedFrame;
    } catch (error: any) {
      if (this.keyProviderOptions.ratchetWindowSize > 0) {
        if (ratchetOpts.ratchetCount < this.keyProviderOptions.ratchetWindowSize) {
          workerLogger.debug(
            `ratcheting key attempt ${ratchetOpts.ratchetCount} of ${
              this.keyProviderOptions.ratchetWindowSize
            }, for kind ${encodedFrame instanceof RTCEncodedAudioFrame ? 'audio' : 'video'}`,
          );

          let ratchetedKeySet: KeySet | undefined;
          if (keySet === this.keys.getKeySet(keyIndex)) {
            // only ratchet if the currently set key is still the same as the one used to decrypt this frame
            // if not, it might be that a different frame has already ratcheted and we try with that one first
            const newMaterial = await this.keys.ratchetKey(keyIndex, false);

            ratchetedKeySet = await deriveKeys(newMaterial, this.keyProviderOptions.ratchetSalt);
          }

          const frame = await this.decryptFrame(encodedFrame, keyIndex, initialMaterial || keySet, {
            ratchetCount: ratchetOpts.ratchetCount + 1,
            encryptionKey: ratchetedKeySet?.encryptionKey,
          });
          if (frame && ratchetedKeySet) {
            this.keys.setKeySet(ratchetedKeySet, keyIndex, true);
            // decryption was successful, set the new key index to reflect the ratcheted key set
            this.keys.setCurrentKeyIndex(keyIndex);
          }
          return frame;
        } else {
          /**
           * Since the key it is first send and only afterwards actually used for encrypting, there were
           * situations when the decrypting failed due to the fact that the received frame was not encrypted
           * yet and ratcheting, of course, did not solve the problem. So if we fail RATCHET_WINDOW_SIZE times,
           * we come back to the initial key.
           */
          if (initialMaterial) {
            workerLogger.debug('resetting to initial material');
            this.keys.setKeyFromMaterial(initialMaterial.material, keyIndex);
          }

          workerLogger.warn('maximum ratchet attempts exceeded');
          throw new CryptorError(
            `valid key missing for participant ${this.participantIdentity}`,
            CryptorErrorReason.InvalidKey,
          );
        }
      } else {
        throw new CryptorError(
          `Decryption failed: ${error.message}`,
          CryptorErrorReason.InvalidKey,
        );
      }
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

  private frameIsH264(frame: RTCEncodedVideoFrame): boolean {
    let detectedCodec = this.getVideoCodec(frame) ?? this.videoCodec;
    const data = new Uint8Array(frame.data);
    try {
      const naluIndices = findNALUIndices(data);

      // if the detected codec is undefined we test whether it _looks_ like a h264 frame as a best guess
      const isH264 =
        detectedCodec === 'h264' ||
        naluIndices.some((naluIndex) =>
          [NALUType.SLICE_IDR, NALUType.SLICE_NON_IDR].includes(parseNALUType(data[naluIndex])),
        );
        return isH264;
    } catch (e) {
    }
    return false;
  }

  private getUnencryptedBytes(frame: RTCEncodedVideoFrame | RTCEncodedAudioFrame): number {
    if (isVideoFrame(frame)) {
      let detectedCodec = this.getVideoCodec(frame) ?? this.videoCodec;

      if (detectedCodec === 'av1' || detectedCodec === 'vp9') {
        throw new Error(`${detectedCodec} is not yet supported for end to end encryption`);
      }

      if (detectedCodec === 'vp8') {
        return UNENCRYPTED_BYTES[frame.type];
      }

      const data = new Uint8Array(frame.data);
      try {
        const naluIndices = findNALUIndices(data);

        // if the detected codec is undefined we test whether it _looks_ like a h264 frame as a best guess
        const isH264 =
          detectedCodec === 'h264' ||
          naluIndices.some((naluIndex) =>
            [NALUType.SLICE_IDR, NALUType.SLICE_NON_IDR].includes(parseNALUType(data[naluIndex])),
          );

        if (isH264) {
          for (const index of naluIndices) {
            let type = parseNALUType(data[index]);
            switch (type) {
              case NALUType.SLICE_IDR:
              case NALUType.SLICE_NON_IDR:
                return index + 2;
              default:
                break;
            }
          }
          throw new TypeError('Could not find NALU');
        }
      } catch (e) {
        // no op, we just continue and fallback to vp8
      }

      return UNENCRYPTED_BYTES[frame.type];
    } else {
      return UNENCRYPTED_BYTES.audio;
    }
  }

  /**
   * inspects frame payloadtype if available and maps it to the codec specified in rtpMap
   */
  private getVideoCodec(frame: RTCEncodedVideoFrame): VideoCodec | undefined {
    if (this.rtpMap.size === 0) {
      return undefined;
    }
    // @ts-expect-error payloadType is not yet part of the typescript definition and currently not supported in Safari
    const payloadType = frame.getMetadata().payloadType;
    const codec = payloadType ? this.rtpMap.get(payloadType) : undefined;
    return codec;
  }
}

export function needsRbspUnescaping(frameData: Uint8Array) {
  for (var i = 0; i < frameData.length - 3; i++) {
    if (frameData[i] == 0 && frameData[i + 1] == 0 && frameData[i + 2] == 3)
      return true;
  }
  return false;
}

export function ParseRbsp(stream: Uint8Array): Uint8Array {
  const dataOut: number[] = [];
  var length = stream.length;
  for (var i = 0; i < stream.length;) {
    // Be careful about over/underflow here. byte_length_ - 3 can underflow, and
    // i + 3 can overflow, but byte_length_ - i can't, because i < byte_length_
    // above, and that expression will produce the number of bytes left in
    // the stream including the byte at i.
    if (length - i >= 3 && !stream[i] && !stream[i + 1] && stream[i + 2] == 3) {
      // Two rbsp bytes.
      dataOut.push(stream[i++]);
      dataOut.push(stream[i++]);
      // Skip the emulation byte.
      i++;
    } else {
      // Single rbsp byte.
      dataOut.push(stream[i++]);
    }
  }
  return new Uint8Array(dataOut);
}

const kZerosInStartSequence = 2;
const kEmulationByte = 3;

export function WriteRbsp(data_in: Uint8Array): Uint8Array {
  const dataOut: number[] = [];
  var numConsecutiveZeros = 0;
  for (var i = 0; i < data_in.length; ++i) {
    var byte = data_in[i];
    if (byte <= kEmulationByte &&
        numConsecutiveZeros >= kZerosInStartSequence) {
      // Need to escape.
      dataOut.push(kEmulationByte);
      numConsecutiveZeros = 0;
    }
    dataOut.push(byte);
    if (byte == 0) {
      ++numConsecutiveZeros;
    } else {
      numConsecutiveZeros = 0;
    }
  }
  return new Uint8Array(dataOut);
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

/**
 * we use a magic frame trailer to detect whether a frame is injected
 * by the livekit server and thus to be treated as unencrypted
 * @internal
 */
export function isFrameServerInjected(frameData: ArrayBuffer, trailerBytes: Uint8Array): boolean {
  if (trailerBytes.byteLength === 0) {
    return false;
  }
  const frameTrailer = new Uint8Array(
    frameData.slice(frameData.byteLength - trailerBytes.byteLength),
  );
  return trailerBytes.every((value, index) => value === frameTrailer[index]);
}
