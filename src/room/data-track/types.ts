import { Encryption_Type, DataTrackInfo as ProtocolDataTrackInfo } from '@livekit/protocol';
import { type DataTrackHandle } from './handle';
import { DataTrackFrameEncoding, DataTrackSchemaId } from './schema';

export * from './schema';

export type DataTrackSid = string;

/** Information about a published data track. */
export type DataTrackInfo = {
  sid: DataTrackSid;
  pubHandle: DataTrackHandle;
  name: string;
  usesE2ee: boolean;

  /** Schema associated with frames sent on the track.
   *
   * Absent if the publisher did not associate a {@link DataTrackSchemaId} with the track.
   */
  schema?: DataTrackSchemaId;

  /** Encoding of frames sent on the track.
   *
   * Absent if the publisher did not specify a {@link DataTrackFrameEncoding} for the track.
   */
  frameEncoding?: DataTrackFrameEncoding;
};

export type RemoteDataTrackPipelineOptions = {
  /** Set the maximum number of in-flight partial frames the depacketizer will track
   * concurrently for this track. Higher values give more out-of-order tolerance for
   * high-frequency senders. Defaults to 1.
   */
  maxPartialFrames?: number;
};

export const DataTrackInfo = {
  from(protocolInfo: ProtocolDataTrackInfo): DataTrackInfo {
    return {
      sid: protocolInfo.sid,
      pubHandle: protocolInfo.pubHandle,
      name: protocolInfo.name,
      usesE2ee: protocolInfo.encryption !== Encryption_Type.NONE,
      schema: protocolInfo.schema ? DataTrackSchemaId.from(protocolInfo.schema) : undefined,
      frameEncoding: protocolInfo.frameEncoding
        ? DataTrackFrameEncoding.from(protocolInfo.frameEncoding)
        : undefined,
    };
  },
  toProtobuf(info: DataTrackInfo): ProtocolDataTrackInfo {
    return new ProtocolDataTrackInfo({
      sid: info.sid,
      pubHandle: info.pubHandle,
      name: info.name,
      encryption: info.usesE2ee ? Encryption_Type.GCM : Encryption_Type.NONE,
      schema: info.schema ? DataTrackSchemaId.toProtobuf(info.schema) : undefined,
      frameEncoding: info.frameEncoding
        ? DataTrackFrameEncoding.toProtobuf(info.frameEncoding)
        : undefined,
    });
  },
};
