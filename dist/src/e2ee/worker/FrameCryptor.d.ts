import type TypedEventEmitter from 'typed-emitter';
import type { VideoCodec } from '../../room/track/options';
import { type CryptorCallbacks } from '../events';
import type { KeyProviderOptions } from '../types';
import type { ParticipantKeyHandler } from './ParticipantKeyHandler';
export declare const encryptionEnabledMap: Map<string, boolean>;
export interface FrameCryptorConstructor {
    new (opts?: unknown): BaseFrameCryptor;
}
export interface TransformerInfo {
    readable: ReadableStream;
    writable: WritableStream;
    transformer: TransformStream;
    abortController: AbortController;
}
declare const BaseFrameCryptor_base: new () => TypedEventEmitter<CryptorCallbacks>;
export declare class BaseFrameCryptor extends BaseFrameCryptor_base {
    protected encodeFunction(encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController): Promise<any>;
    protected decodeFunction(encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController): Promise<any>;
}
/**
 * Cryptor is responsible for en-/decrypting media frames.
 * Each Cryptor instance is responsible for en-/decrypting a single mediaStreamTrack.
 */
export declare class FrameCryptor extends BaseFrameCryptor {
    private sendCounts;
    private participantIdentity;
    private trackId;
    private keys;
    private videoCodec?;
    private rtpMap;
    private keyProviderOptions;
    /**
     * used for detecting server injected unencrypted frames
     */
    private sifTrailer;
    private sifGuard;
    private detectedCodec?;
    constructor(opts: {
        keys: ParticipantKeyHandler;
        participantIdentity: string;
        keyProviderOptions: KeyProviderOptions;
        sifTrailer?: Uint8Array;
    });
    private get logContext();
    /**
     * Assign a different participant to the cryptor.
     * useful for transceiver re-use
     * @param id
     * @param keys
     */
    setParticipant(id: string, keys: ParticipantKeyHandler): void;
    unsetParticipant(): void;
    isEnabled(): boolean | undefined;
    getParticipantIdentity(): string | undefined;
    getTrackId(): string | undefined;
    /**
     * Update the video codec used by the mediaStreamTrack
     * @param codec
     */
    setVideoCodec(codec: VideoCodec): void;
    /**
     * rtp payload type map used for figuring out codec of payload type when encoding
     * @param map
     */
    setRtpMap(map: Map<number, VideoCodec>): void;
    setupTransform(operation: 'encode' | 'decode', readable: ReadableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>, writable: WritableStream<RTCEncodedVideoFrame | RTCEncodedAudioFrame>, trackId: string, codec?: VideoCodec): void;
    setSifTrailer(trailer: Uint8Array): void;
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
    protected encodeFunction(encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController): Promise<void>;
    /**
     * Function that will be injected in a stream and will decrypt the given encoded frames.
     *
     * @param {RTCEncodedVideoFrame|RTCEncodedAudioFrame} encodedFrame - Encoded video frame.
     * @param {TransformStreamDefaultController} controller - TransportStreamController.
     */
    protected decodeFunction(encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame, controller: TransformStreamDefaultController): Promise<void>;
    /**
     * Function that will decrypt the given encoded frame. If the decryption fails, it will
     * ratchet the key for up to RATCHET_WINDOW_SIZE times.
     */
    private decryptFrame;
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
    private makeIV;
    private getUnencryptedBytes;
    /**
     * inspects frame payloadtype if available and maps it to the codec specified in rtpMap
     */
    private getVideoCodec;
}
/**
 * Slice the NALUs present in the supplied buffer, assuming it is already byte-aligned
 * code adapted from https://github.com/medooze/h264-frame-parser/blob/main/lib/NalUnits.ts to return indices only
 */
export declare function findNALUIndices(stream: Uint8Array): number[];
export declare function parseNALUType(startByte: number): NALUType;
export declare enum NALUType {
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
    /** Coded slice of an auxiliary coded picture without partitioning */
    SLICE_AUX = 19,
    /** Coded slice extension */
    SLICE_EXT = 20,
    /** Coded slice extension for a depth view component or a 3D-AVC texture view component */
    SLICE_LAYER_EXT = 21
}
/**
 * we use a magic frame trailer to detect whether a frame is injected
 * by the livekit server and thus to be treated as unencrypted
 * @internal
 */
export declare function isFrameServerInjected(frameData: ArrayBuffer, trailerBytes: Uint8Array): boolean;
export {};
//# sourceMappingURL=FrameCryptor.d.ts.map