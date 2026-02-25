import type { DataTrackFrame } from './frame';
import type OutgoingDataTrackManager from './outgoing/OutgoingDataTrackManager';
import {
  DataTrackSymbol,
  type IDataTrack,
  type ILocalTrack,
  TrackSymbol,
} from './track-interfaces';
import type { DataTrackInfo } from './types';

export default class LocalDataTrack implements ILocalTrack, IDataTrack {
  readonly trackSymbol = TrackSymbol;

  readonly isLocal = true;

  readonly typeSymbol = DataTrackSymbol;

  info: DataTrackInfo;

  protected manager: OutgoingDataTrackManager;

  /** @internal */
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
      // propagate upwards into the public interface.
      throw err;
    }
  }

  /**
   * Unpublish the track from the SFU. Once this is called, any further calls to {@link tryPush}
   * will fail.
   * */
  async unpublish() {
    try {
      await this.manager.unpublishRequest(this.info.pubHandle);
    } catch (err) {
      // NOTE: Rethrow errors to break Throws<...> type boundary
      throw err;
    }
  }
}
