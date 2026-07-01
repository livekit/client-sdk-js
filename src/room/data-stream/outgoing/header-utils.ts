import {
  DataPacket,
  DataStream_ByteHeader,
  DataStream_CompressionType,
  DataStream_Header,
  DataStream_OperationType,
  DataStream_TextHeader,
} from '@livekit/protocol';
import type { ByteStreamInfo, StreamTextOptions, TextStreamInfo } from '../../types';
import { numberToBigInt } from '../../utils';

/** The data-streams-v2 wire signals carried directly on the header: the compression flag and the
 * inline single-packet payload. Both used to live in reserved header attributes; they are now
 * first-class protobuf fields on `DataStream.Header`. */
export interface StreamHeaderV2Fields {
  /** Compression applied to the inline/chunked payload. Defaults to `NONE` when omitted. */
  compression?: DataStream_CompressionType;
  /** The full payload smuggled into the header for single-packet (inline) sends. */
  inlineContent?: Uint8Array;
}

/** Builds the `DataStream_Header` for a text stream from its info and stream options. */
export function buildTextStreamHeader(
  info: TextStreamInfo,
  options?: Pick<StreamTextOptions, 'version' | 'replyToStreamId' | 'type'>,
  v2?: StreamHeaderV2Fields,
): DataStream_Header {
  return new DataStream_Header({
    streamId: info.id,
    mimeType: info.mimeType,
    topic: info.topic,
    timestamp: numberToBigInt(info.timestamp),
    totalLength: numberToBigInt(info.size),
    attributes: info.attributes,
    compression: v2?.compression ?? DataStream_CompressionType.NONE,
    inlineContent: v2?.inlineContent,
    contentHeader: {
      case: 'textHeader',
      value: new DataStream_TextHeader({
        version: options?.version,
        attachedStreamIds: info.attachedStreamIds,
        replyToStreamId: options?.replyToStreamId,
        operationType:
          options?.type === 'update'
            ? DataStream_OperationType.UPDATE
            : DataStream_OperationType.CREATE,
      }),
    },
  });
}

/** Builds the `DataStream_Header` for a byte stream from its info. */
export function buildByteStreamHeader(
  info: ByteStreamInfo,
  v2?: StreamHeaderV2Fields,
): DataStream_Header {
  return new DataStream_Header({
    streamId: info.id,
    mimeType: info.mimeType,
    topic: info.topic,
    timestamp: numberToBigInt(info.timestamp),
    totalLength: numberToBigInt(info.size),
    attributes: info.attributes,
    compression: v2?.compression ?? DataStream_CompressionType.NONE,
    inlineContent: v2?.inlineContent,
    contentHeader: {
      case: 'byteHeader',
      value: new DataStream_ByteHeader({
        name: info.name,
      }),
    },
  });
}

/** Wraps a `DataStream_Header` in a `DataPacket` ready to be sent over a data channel. */
export function createStreamHeaderPacket(
  header: DataStream_Header,
  destinationIdentities?: Array<string>,
): DataPacket {
  return new DataPacket({
    destinationIdentities,
    value: {
      case: 'streamHeader',
      value: header,
    },
  });
}
