import type { DataStream_Header } from '@livekit/protocol';

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
  | 'leave-full-reconnect';

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
}

// /**
//  * Shared header properties across all contentTypes
//  */
// export interface BaseDataStreamHeader {
//   messageId: string;
//   timestamp: number;
//   topic: string; // as suggested by ben, a way to differentiate between multiple text use cases in complex apps
//   streamType: 'finite' | 'streaming'; // if we know the size of the entire payload ahead of time it's `finite`, LLM text stream cases would be `streaming`
//   contentType: 'text' | 'image' | 'file'; // extensible, thinking images might be worth while as their own type due to their expected frequency in usage
//   mimeType: string; // could probably be more specific than string would be especially useful for different file types
//   totalLength?: number; // in bytes, would be unknown for LLM output ahead of time, but known for files + blobs, only present if `streamType` is `finite`
//   totalChunks?: number; // // would be unknown for LLM output ahead of time, but known for files + blobs, only present if `streamType` is `finite`
//   encryptionType?: 'aes-gcm' | 'none';
// }

// /**
//  * Header properties specific to contentType `text`
//  */
// export interface TextStreamHeader extends BaseDataStreamHeader {
//   contentType: 'text';
//   operationType: 'create' | 'update' | 'delete' | 'reaction';
//   version?: number; // optional versioning for edits/updates
//   replyToMessageId?: string; // set for replies to specific messages
// }

// /**
//  * Header properties specific to contentType `file` or `image`
//  */
// export interface FileStreamHeader extends BaseDataStreamHeader {
//   contentType: 'file' | 'image';
//   fileName: string; // optional, the name of the file being transferred
// }

// /**
//  * Payload packets that follow an initial header packet
//  */
// // export interface DataStreamPacket {
// //   messageId: string;
// //   chunkId: number;
// //   content: string; // binary content, utf-8 if text. should be fully encryptable
// //   contentLength: number; // in bytes
// //   complete?: boolean; // for streaming use cases where we don't know the initial amount of packets, but still want to mark it as complete at some point
// //   iv?: Uint8Array; // initialization vector for AES-GCM (if encryption is used)
// // }

// /**
//  * Potentially interesting: a way to `Ack` both header retrieval and transfer completion
//  */
// export interface DataStreamAck {
//   messageId: string;
//   type: 'init_ack' | 'completion_ack';
//   status: 'ready' | 'error';
//   errorMessage?: string;
//   // missingChunkIds?: number[]; // TBD option to re-request missing chunks when completion ack has error status
// }

export interface StreamBuffer<T extends string | Uint8Array> {
  header: DataStream_Header;
  chunks: Array<number>;
  streamController: ReadableStreamDefaultController<T>;
  startTime: number;
  endTime?: number;
}

interface BaseStreamInfo {
  messageId: string;
  mimeType: string;
  topic: string;
  timestamp: number;
  size?: number;
  extensions?: Record<string, string>;
}
export interface FileStreamInfo extends BaseStreamInfo {
  fileName: string;
}

export interface TextStreamInfo extends BaseStreamInfo {
  isFinite: boolean;
}
