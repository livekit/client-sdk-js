import type { E2EEOptions } from './e2ee/types';
import type { FrameMetadataOptions } from './frameMetadata/FrameMetadataManager';
import type { ReconnectPolicy } from './room/ReconnectPolicy';
import type {
  AudioCaptureOptions,
  AudioOutputOptions,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from './room/track/options';
import type { AdaptiveStreamSettings } from './room/track/types';

export interface WebAudioSettings {
  audioContext: AudioContext;
}

/**
 * @internal
 */
export interface InternalRoomOptions {
  /**
   * AdaptiveStream lets LiveKit automatically manage quality of subscribed
   * video tracks to optimize for bandwidth and CPU.
   * When attached video elements are visible, it'll choose an appropriate
   * resolution based on the size of largest video element it's attached to.
   *
   * When none of the video elements are visible, it'll temporarily pause
   * the data flow until they are visible again.
   */
  adaptiveStream: AdaptiveStreamSettings | boolean;

  /**
   * enable Dynacast, off by default. With Dynacast dynamically pauses
   * video layers that are not being consumed by any subscribers, significantly
   * reducing publishing CPU and bandwidth usage.
   *
   * Dynacast will be enabled if SVC codecs (VP9/AV1) are used. Multi-codec simulcast
   * requires dynacast
   */
  dynacast: boolean;

  /**
   * default options to use when capturing user's audio
   */
  audioCaptureDefaults?: AudioCaptureOptions;

  /**
   * default options to use when capturing user's video
   */
  videoCaptureDefaults?: VideoCaptureOptions;

  /**
   * default options to use when publishing tracks
   */
  publishDefaults?: TrackPublishDefaults;

  /**
   * audio output for the room
   */
  audioOutput?: AudioOutputOptions;

  /**
   * should local tracks be stopped when they are unpublished. defaults to true
   * set this to false if you would prefer to clean up unpublished local tracks manually.
   */
  stopLocalTrackOnUnpublish: boolean;

  /**
   * policy to use when attempting to reconnect
   */
  reconnectPolicy: ReconnectPolicy;

  /**
   * specifies whether the sdk should automatically disconnect the room
   * on 'pagehide' and 'beforeunload' events
   */
  disconnectOnPageLeave: boolean;

  /**
   * @internal
   * experimental flag, introduce a delay before sending signaling messages
   */
  expSignalLatency?: number;

  /**
   * mix all audio tracks in web audio, helps to tackle some audio auto playback issues
   * allows for passing in your own AudioContext instance, too
   */

  webAudioMix: boolean | WebAudioSettings;

  /**
   * @deprecated Use `encryption` field instead.
   */
  e2ee?: E2EEOptions;

  /**
   * @experimental
   * Options for enabling end-to-end encryption.
   */
  encryption?: E2EEOptions;

  loggerName?: string;

  /**
   * @experimental
   * Options for enabling frame metadata on video tracks.
   * Frame metadata carries frame-level information such as user timestamps and frame IDs.
   */
  frameMetadata?: FrameMetadataOptions;

  /**
   * @deprecated Use {@link InternalRoomOptions.frameMetadata} instead.
   */
  packetTrailer?: FrameMetadataOptions;

  /**
   * will attempt to connect via single peer connection mode.
   * falls back to dual peer connection mode if not available.
   *
   * @default true
   */
  singlePeerConnection: boolean;

  /**
   * Decides which video codecs this participant is willing to receive. Called with each video
   * codec the browser reports it can decode; return `false` to exclude it from negotiation.
   *
   * An excluded codec makes the server treat this participant as unable to receive it, so a
   * track published in that codec is delivered in the publisher's backup codec instead (see
   * `TrackPublishOptions.backupCodec`). Without a compatible backup codec, no video is received
   * for that track.
   *
   * How far that fallback reaches depends on the publisher's `backupCodecPolicy`. With the
   * default (`PREFER_REGRESSION`), one subscriber excluding the primary codec makes the publisher
   * switch to its backup codec for **every** subscriber of that track, including those that could
   * receive the primary codec. For each subscriber to keep receiving the best codec it allows,
   * publishers need `backupCodecPolicy: BackupCodecPolicy.SIMULCAST`, at the cost of encoding
   * and sending both codecs.
   *
   * Only the allowed set matters: the server picks among the publisher's codecs in the
   * publisher's order, so receive-side ordering has no effect. Retransmission and FEC codecs
   * (rtx, red, ulpfec, flexfec) are always kept. A filter that would exclude every codec is
   * ignored. The filter is read when media sections are negotiated, so it applies for the
   * lifetime of the room and across reconnects.
   *
   * Requires `RTCRtpTransceiver.setCodecPreferences`; a no-op where it is unavailable.
   *
   * @example
   * ```ts
   * new Room({
   *   videoReceiveCodecFilter: (codec) => codec.mimeType.toLowerCase() !== 'video/av1',
   * });
   * ```
   */
  videoReceiveCodecFilter?: (codec: RTCRtpCodec) => boolean;

  /**
   * Options controlling data stream behavior for this room.
   */
  dataStream?: RoomDataStreamOptions;
}

/**
 * Options controlling data stream behavior for a room.
 */
export interface RoomDataStreamOptions {
  /**
   * Maximum size, in bytes, of the payload this client accepts from a single incoming data stream.
   *
   * A compressed stream can inflate to an arbitrarily large payload, so the decompressed output is
   * bounded rather than trusting the size declared on the wire. An incoming stream that exceeds the
   * cap fails with a `DataStreamErrorReason.PayloadTooLarge` error on the next read instead of
   * buffering without bound.
   *
   * This is enforced on the receiving side only: raising it on a sender has no effect.
   *
   * @default 5_000_000_000 (5 GB)
   */
  maxPayloadByteLength?: number;
}

/**
 * Options for when creating a new room
 */
export interface RoomOptions extends Partial<InternalRoomOptions> {}

/**
 * @internal
 */
export interface InternalRoomConnectOptions {
  /** autosubscribe to room tracks after joining, defaults to true */
  autoSubscribe: boolean;

  /** amount of time for PeerConnection to be established, defaults to 15s */
  peerConnectionTimeout: number;

  /**
   * use to override any RTCConfiguration options.
   */
  rtcConfig?: RTCConfiguration;

  /**
   * when the server runs ICE lite, asks it to use a full ICE agent for this participant.
   * this is a server-side setting that the server may ignore, defaults to false
   */
  disableIceLite: boolean;

  /** specifies how often an initial join connection is allowed to retry (only applicable if server is not reachable) */
  maxRetries: number;

  /** amount of time for Websocket connection to be established, defaults to 15s */
  websocketTimeout: number;
}

/**
 * Options for Room.connect()
 */
export interface RoomConnectOptions extends Partial<InternalRoomConnectOptions> {}
