import type { DataTrackFrame } from "./frame";
import { type DataTrackHandle } from "./handle";
import { type DataTrackOutgoingManager } from "./outgoing/manager";

export type DataTrackSid = string;

/** Information about a published data track. */
export type DataTrackInfo = {
  sid: DataTrackSid,
  pubHandle: DataTrackHandle,
  name: String,
  usesE2ee: boolean,
};

export class LocalDataTrack {
  info: DataTrackInfo;

  protected manager: DataTrackOutgoingManager;

  constructor(info: DataTrackInfo, manager: DataTrackOutgoingManager) {
    this.info = info;
    this.manager = manager;
  }

  /** The raw descriptor from the manager containing the internal state for this local track. */
  protected get descriptor() {
    return this.manager.getDescriptor(this.info.pubHandle);
  }

  isPublished() {
    return this.descriptor?.type === "active";
  }

  /** Try pushing a frame to subscribers of the track.
   *
   * Pushing a frame can fail for several reasons:
   *
   * - The track has been unpublished by the local participant or SFU
   * - The room is no longer connected
   * - Frames are being pushed too fast (FIXME: this isn't the case in the js implementation?)
   */
  tryPush(frame: DataTrackFrame, options: { signal?: AbortSignal }) {
    // FIXME: rust implementation maps errors to dropped here?
    // .map_err(|err| PushFrameError::new(err.into_inner(), PushFrameErrorReason::Dropped))
    return this.manager.trySend(this.info.pubHandle, frame, options);
  }
}
