import type { DataTrackFrame } from './frame';
import { type DataTrackHandle } from './handle';
import type OutgoingDataTrackManager from './outgoing/OutgoingDataTrackManager';

export type DataTrackSid = string;

/** Information about a published data track. */
export type DataTrackInfo = {
  sid: DataTrackSid;
  pubHandle: DataTrackHandle;
  name: String;
  usesE2ee: boolean;
};

export class LocalDataTrack {
  info: DataTrackInfo;

  protected manager: OutgoingDataTrackManager;

  constructor(info: DataTrackInfo, manager: OutgoingDataTrackManager) {
    this.info = info;
    this.manager = manager;
  }

  /** The raw descriptor from the manager containing the internal state for this local track. */
  protected get descriptor() {
    return this.manager.getDescriptor(this.info.pubHandle);
  }

  isPublished() {
    return this.descriptor?.type === 'active';
  }

  /** Try pushing a frame to subscribers of the track.
   *
   * Pushing a frame can fail for several reasons:
   *
   * - The track has been unpublished by the local participant or SFU
   * - The room is no longer connected
   */
  tryPush(payload: DataTrackFrame['payload']) {
    try {
      return this.manager.tryProcessAndSend(this.info.pubHandle, payload);
    } catch (err) {
      // NOTE: wrapping in the bare try/catch like this means that the Throws<...> type doesn't
      // propegate upwards into the public interface.
      throw err;
    }
  }
}
