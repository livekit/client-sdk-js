import { Encryption_Type, DataTrackInfo as ProtocolDataTrackInfo } from '@livekit/protocol';
import { type DataTrackHandle } from './handle';

export type DataTrackSid = string;

/** Information about a published data track. */
export type DataTrackInfo = {
  sid: DataTrackSid;
  pubHandle: DataTrackHandle;
  name: string;
  usesE2ee: boolean;
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
    };
  },
  toProtobuf(info: DataTrackInfo): ProtocolDataTrackInfo {
    return new ProtocolDataTrackInfo({
      sid: info.sid,
      pubHandle: info.pubHandle,
      name: info.name,
      encryption: info.usesE2ee ? Encryption_Type.GCM : Encryption_Type.NONE,
    });
  },
};
