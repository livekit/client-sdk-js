import type { Throws } from '../../utils/throws';
import type { DataTrackFrame } from './frame';
import { type DataTrackHandle } from './handle';
import type { DataTrackPushFrameError, DataTrackPushFrameErrorReason } from './outgoing/errors';
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
   * - Frames are being pushed too fast (FIXME: this isn't the case in the js implementation?)
   */
  tryPush(payload: DataTrackFrame['payload'], options?: { signal?: AbortSignal }): Throws<
    void,
    | DataTrackPushFrameError<DataTrackPushFrameErrorReason.Dropped>
    | DataTrackPushFrameError<DataTrackPushFrameErrorReason.TrackUnpublished>
  > {
    // FIXME: rust implementation maps errors to dropped here?
    // .map_err(|err| PushFrameError::new(err.into_inner(), PushFrameErrorReason::Dropped))
    return this.manager.tryProcessAndSend(this.info.pubHandle, payload, options);
  }
}
