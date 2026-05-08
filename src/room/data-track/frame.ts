import { DataTrackExtensions, DataTrackUserTimestampExtension } from './packet/extensions';

/** A pair of payload bytes and packet extensions which can be fed into a {@link DataTrackPacketizer}. */
export type DataTrackFrame = {
  payload: NonSharedUint8Array;
  userTimestamp?: bigint;
};

/** An internal representation o data track frame which contains all SFU metadata. */
export type DataTrackFrameInternal = {
  payload: NonSharedUint8Array;
  extensions: DataTrackExtensions;
};

export const DataTrackFrameInternal = {
  from(frame: DataTrackFrame) {
    return {
      payload: frame.payload,
      extensions: new DataTrackExtensions({
        userTimestamp: frame.userTimestamp
          ? new DataTrackUserTimestampExtension(frame.userTimestamp)
          : undefined,
      }),
    };
  },
  /** Converts from a DataTrackFrameInternal -> DataTrackFrame. Some internal information is
   * discarded like e2ee encrption extension data. */
  lossyIntoFrame(frame: DataTrackFrameInternal): DataTrackFrame {
    return {
      payload: frame.payload,
      userTimestamp: frame.extensions.userTimestamp?.timestamp,
    };
  },
};
