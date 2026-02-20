import { DataTrackExtensions } from './packet/extensions';
import DataTrackPacketizer from './packetizer';

/** A pair of payload bytes and packet extensions which can be fed into a {@link DataTrackPacketizer}. */
export type DataTrackFrame = {
  payload: Uint8Array;
  extensions: DataTrackExtensions;
};
