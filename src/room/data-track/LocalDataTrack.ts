import log, { LoggerNames, type StructuredLogger, getLogger } from '../../logger';
import { type DataTrackFrame, DataTrackFrameInternal } from './frame';
import type { DataTrackHandle } from './handle';
import type OutgoingDataTrackManager from './outgoing/OutgoingDataTrackManager';
import { DataTrackPushFrameError } from './outgoing/errors';
import type { DataTrackOptions } from './outgoing/types';
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

  protected options: DataTrackOptions;

  /** Represents the currently active {@link DataTrackHandle} for the publication. */
  protected handle: DataTrackHandle | null = null;

  protected manager: OutgoingDataTrackManager;

  protected log: StructuredLogger = log;

  /** @internal */
  constructor(options: DataTrackOptions, manager: OutgoingDataTrackManager) {
    this.options = options;
    this.manager = manager;

    this.log = getLogger(LoggerNames.DataTracks);
  }

  /** @internal */
  static withExplicitHandle(
    options: DataTrackOptions,
    manager: OutgoingDataTrackManager,
    handle: DataTrackHandle,
  ) {
    const track = new LocalDataTrack(options, manager);
    track.handle = handle;
    return track;
  }

  /** Metrics about the data track publication. */
  get info() {
    const descriptor = this.descriptor;
    if (descriptor?.type === 'active') {
      return descriptor.info;
    } else {
      return undefined;
    }
  }

  /** The raw descriptor from the manager containing the internal state for this local track. */
  protected get descriptor() {
    return this.handle ? this.manager.getDescriptor(this.handle) : null;
  }

  /**
   * Publish the track to the SFU. This must be done before calling {@link tryPush} for the first time.
   * @internal
   * */
  async publish(signal?: AbortSignal) {
    try {
      this.handle = await this.manager.publishRequest(this.options, signal);
    } catch (err) {
      // NOTE: Rethrow errors to break Throws<...> type boundary
      throw err;
    }
  }

  isPublished(): this is { info: DataTrackInfo } {
    // NOTE: a track which is internally in the "resubscribing" state is still considered
    // published from the public API perspective.
    return this.descriptor?.type === 'active' && this.descriptor.publishState !== 'unpublished';
  }

  /** Try pushing a frame to subscribers of the track.
   *
   * Pushing a frame can fail for several reasons:
   *
   * - The track has been unpublished by the local participant or SFU
   * - The room is no longer connected
   */
  tryPush(frame: DataTrackFrame) {
    if (!this.handle) {
      throw DataTrackPushFrameError.trackUnpublished();
    }

    const internalFrame = DataTrackFrameInternal.from(frame);

    try {
      return this.manager.tryProcessAndSend(this.handle, internalFrame);
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
    if (!this.handle) {
      log.warn(
        `Data track "${this.options.name}" is not published, so unpublishing has no effect.`,
      );
      return;
    }

    try {
      await this.manager.unpublishRequest(this.handle);
    } catch (err) {
      // NOTE: Rethrow errors to break Throws<...> type boundary
      throw err;
    }
  }
}
