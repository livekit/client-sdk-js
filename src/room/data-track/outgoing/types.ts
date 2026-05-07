import type LocalDataTrack from '../LocalDataTrack';
import { type DataTrackHandle } from '../handle';
import { type DataTrackInfo, type DataTrackSid } from '../types';
import { type DataTrackPublishError, type DataTrackPublishErrorReason } from './errors';

/** Options for publishing a data track. */
export type DataTrackOptions = {
  name: string;
};

/** Encodes whether a data track publish request to the SFU has been successful or not. */
export type SfuPublishResponseResult =
  | { type: 'ok'; data: DataTrackInfo }
  | {
      type: 'error';
      error:
        | DataTrackPublishError<DataTrackPublishErrorReason.NotAllowed>
        | DataTrackPublishError<DataTrackPublishErrorReason.DuplicateName>
        | DataTrackPublishError<DataTrackPublishErrorReason.InvalidName>
        | DataTrackPublishError<DataTrackPublishErrorReason.LimitReached>;
    };

/** Request sent to the SFU to publish a track. */
export type EventSfuPublishRequest = {
  handle: DataTrackHandle;
  name: string;
  usesE2ee: boolean;
};

/** Request sent to the SFU to unpublish a track. */
export type EventSfuUnpublishRequest = {
  handle: DataTrackHandle;
};

/** A serialized packet is ready to be sent over the transport. */
export type EventPacketAvailable = {
  /** The handle associated with the data track which this packet bytes belong to. */
  handle: DataTrackHandle;
  bytes: NonSharedUint8Array;
};

/** A track has been created by a local participant and is available to be
 * subscribed to. */
export type EventTrackPublished = { track: LocalDataTrack };

/** A track has been unpublished by a remote participant and can no longer be subscribed to. */
export type EventTrackUnpublished = { sid: DataTrackSid };

/** A track has had all of its in flight packets sent via the rtc data channel. */
export type EventPacketsFlushedChange = { handle: DataTrackHandle; isFlushed: boolean };
