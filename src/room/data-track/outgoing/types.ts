import { type DataTrackHandle } from '../handle';
import { type DataTrackInfo } from '../types';
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
        | DataTrackPublishError<DataTrackPublishErrorReason.LimitReached>;
    };

/** Request sent to the SFU to publish a track. */
export type OutputEventSfuPublishRequest = {
  handle: DataTrackHandle;
  name: string;
  usesE2ee: boolean;
};

/** Request sent to the SFU to unpublish a track. */
export type OutputEventSfuUnpublishRequest = {
  handle: DataTrackHandle;
};

/** Serialized packets are ready to be sent over the transport. */
export type OutputEventPacketsAvailable = {
  bytes: Uint8Array;
};
