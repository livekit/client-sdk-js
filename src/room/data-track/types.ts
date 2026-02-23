import { type DataTrackHandle } from './handle';
import { Encryption_Type, DataTrackInfo as ProtocolDataTrackInfo } from '@livekit/protocol';

export type DataTrackSid = string;

/** Information about a published data track. */
export type DataTrackInfo = {
  sid: DataTrackSid;
  pubHandle: DataTrackHandle;
  name: String;
  usesE2ee: boolean;
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
};
