import {
  DataPacket,
  DataStream_ByteHeader,
  DataStream_Header,
  DataStream_OperationType,
  DataStream_TextHeader,
} from '@livekit/protocol';
import type { ByteStreamInfo, StreamTextOptions, TextStreamInfo } from '../../types';
import { numberToBigInt } from '../../utils';

/** Builds the `DataStream_Header` for a text stream from its info and stream options. */
export function buildTextStreamHeader(
  info: TextStreamInfo,
  options?: Pick<StreamTextOptions, 'version' | 'replyToStreamId' | 'type'>,
): DataStream_Header {
  return new DataStream_Header({
    streamId: info.id,
    mimeType: info.mimeType,
    topic: info.topic,
    timestamp: numberToBigInt(info.timestamp),
    totalLength: numberToBigInt(info.size),
    attributes: info.attributes,
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
export function buildByteStreamHeader(info: ByteStreamInfo): DataStream_Header {
  return new DataStream_Header({
    streamId: info.id,
    mimeType: info.mimeType,
    topic: info.topic,
    timestamp: numberToBigInt(info.timestamp),
    totalLength: numberToBigInt(info.size),
    attributes: info.attributes,
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
