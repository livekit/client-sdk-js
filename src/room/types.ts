import type { DataStream_Chunk, Encryption_Type } from '@livekit/protocol';

export type SimulationOptions = {
  publish?: {
    audio?: boolean;
    video?: boolean;
    useRealTracks?: boolean;
  };
  participants?: {
    count?: number;
    aspectRatios?: Array<number>;
    audio?: boolean;
    video?: boolean;
  };
};

export interface SendTextOptions {
  topic?: string;
  // replyToMessageId?: string;
  destinationIdentities?: Array<string>;
  attachments?: Array<File>;
  onProgress?: (progress: number) => void;
  attributes?: Record<string, string>;
  /** Whether to compress the payload (deflate-raw). Defaults to true. Compression is only applied
   * when every recipient supports data streams v2 and the runtime can compress. */
  compress?: boolean;
}

export interface SendBytesOptions {
  topic?: string;
  destinationIdentities?: Array<string>;
  attributes?: Record<string, string>;
  onProgress?: (progress: number) => void;
  /** Whether to compress the payload (deflate-raw). Defaults to true. Compression is only applied
   * when every recipient supports data streams v2 and the runtime can compress. */
  compress?: boolean;
  name?: string;
  mimeType?: string;
}

export interface StreamTextOptions {
  topic?: string;
  destinationIdentities?: Array<string>;
  type?: 'create' | 'update';
  streamId?: string;
  version?: number;
  attachedStreamIds?: Array<string>;
  replyToStreamId?: string;
  totalSize?: number;
  attributes?: Record<string, string>;
}

export type StreamBytesOptions = {
  name?: string;
  topic?: string;
  attributes?: Record<string, string>;
  destinationIdentities?: Array<string>;
  streamId?: string;
  mimeType?: string;
  totalSize?: number;
};

export type SendFileOptions = Pick<
  StreamBytesOptions,
  'topic' | 'mimeType' | 'destinationIdentities'
> & {
  onProgress?: (progress: number) => void;
  encryptionType?: Encryption_Type.NONE;
  /** Whether to compress the payload (deflate-raw). Defaults to true. Compression is only applied
   * when every recipient supports data streams v2 and the runtime can compress. */
  compress?: boolean;
};

export type DataPublishOptions = {
  /**
   * whether to send this as reliable or lossy.
   * For data that you need delivery guarantee (such as chat messages), use Reliable.
   * For data that should arrive as quickly as possible, but you are ok with dropped
   * packets, use Lossy.
   */
  reliable?: boolean;
  /**
   * the identities of participants who will receive the message, will be sent to every one if empty
   */
  destinationIdentities?: string[];
  /** the topic under which the message gets published */
  topic?: string;
};

export type LiveKitReactNativeInfo = {
  // Corresponds to RN's PlatformOSType
  platform: 'ios' | 'android' | 'windows' | 'macos' | 'web' | 'native';
  devicePixelRatio: number;
};

export type SimulationScenario =
  | 'signal-reconnect'
  | 'speaker'
  | 'node-failure'
  | 'server-leave'
  | 'migration'
  | 'resume-reconnect'
  | 'force-tcp'
  | 'force-tls'
  | 'full-reconnect'
  // overrides server-side bandwidth estimator with set bandwidth
  // this can be used to test application behavior when congested or
  // to disable congestion control entirely (by setting bandwidth to 100Mbps)
  | 'subscriber-bandwidth'
  | 'disconnect-signal-on-resume'
  | 'disconnect-signal-on-resume-no-messages'
  // instructs the server to send a full reconnect reconnect action to the client
  | 'leave-full-reconnect'
  | 'fail-on-v1-path';

export type LoggerOptions = {
  loggerName?: string;
  loggerContextCb?: () => Record<string, unknown>;
};

export interface TranscriptionSegment {
  id: string;
  text: string;
  language: string;
  startTime: number;
  endTime: number;
  final: boolean;
  firstReceivedTime: number;
  lastReceivedTime: number;
}

export interface ChatMessage {
  id: string;
  timestamp: number;
  message: string;
  editTimestamp?: number;
  attachedFiles?: Array<File>;
}

/** Information and state for an open incoming data stream. */
export interface StreamController<T extends DataStream_Chunk> {
  info: BaseStreamInfo;
  /** Controller of the `ReadableStream` the stream's reader consumes. */
  controller: ReadableStreamDefaultController<T>;
  startTime: number;
  endTime?: number;
  /**
   * The identity on the stream's header: who the stream is attributed to, and whose open-stream
   * count it occupies.
   */
  sendingParticipantIdentity: string;
  /**
   * The identity whose chunks and trailer the stream accepts.
   *
   * The same as `sendingParticipantIdentity` for every stream except one sent on behalf of
   * another participant, such as an agent publishing a user's speech-to-text on
   * `lk.transcription`. The SFU keeps the claimed identity on such a text header, and marks it
   * `generated`, but stamps the chunks and trailer with the real sender's identity. The real sender
   * is not named anywhere in the header, so this starts out unset and the first chunk or trailer
   * from a participant allowed to send on others' behalf claims the stream; see
   * `IncomingDataStreamManager.validateStreamPacket`.
   */
  packetSenderIdentity: string | undefined;
}

export interface BaseStreamInfo {
  id: string;
  mimeType: string;
  topic: string;
  timestamp: number;
  /** total size in bytes for finite streams and undefined for streams of unknown size */
  size?: number;
  attributes?: Record<string, string>;
  encryptionType: Encryption_Type;
}
export interface ByteStreamInfo extends BaseStreamInfo {
  name: string;
}

export interface TextStreamInfo extends BaseStreamInfo {
  attachedStreamIds?: Array<string>;
}
