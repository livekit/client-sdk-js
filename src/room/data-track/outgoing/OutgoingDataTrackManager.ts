import { EventEmitter } from 'events';
import type { Throws } from '@livekit/throws-transformer/throws';
import type TypedEmitter from 'typed-emitter';
import type { BaseE2EEManager } from '../../../e2ee/E2eeManager';
import { LoggerNames, getLogger } from '../../../logger';
import { abortSignalAny, abortSignalTimeout } from '../../../utils/abort-signal-polyfill';
import { Future } from '../../utils';
import LocalDataTrack from '../LocalDataTrack';
import type { DataTrackFrameInternal } from '../frame';
import { DataTrackHandle, DataTrackHandleAllocator } from '../handle';
import { type DataTrackInfo } from '../types';
import {
  DataTrackPublishError,
  DataTrackPushFrameError,
  DataTrackPushFrameErrorReason,
} from './errors';
import DataTrackOutgoingPipeline from './pipeline';
import {
  type DataTrackOptions,
  type EventPacketAvailable,
  type EventSfuPublishRequest,
  type EventSfuUnpublishRequest,
  type EventTrackPublished,
  type EventTrackUnpublished,
  type SfuPublishResponseResult,
} from './types';

const log = getLogger(LoggerNames.DataTracks);

export type PendingDescriptor = {
  type: 'pending';
  /** Resolves when the descriptor is fully published. */
  completionFuture: Future<void, DataTrackPublishError>;
};
export type ActiveDescriptor = {
  type: 'active';
  info: DataTrackInfo;

  publishState: 'published' | 'republishing' | 'unpublished';

  pipeline: DataTrackOutgoingPipeline;

  /** Resolves when the descriptor is unpublished. */
  unpublishingFuture: Future<void, never>;
};
export type Descriptor = PendingDescriptor | ActiveDescriptor;

export const Descriptor = {
  pending(): PendingDescriptor {
    return {
      type: 'pending',
      completionFuture: new Future(),
    };
  },
  active(info: DataTrackInfo, e2eeManager: BaseE2EEManager | null): ActiveDescriptor {
    return {
      type: 'active',
      info,
      publishState: 'published',
      pipeline: new DataTrackOutgoingPipeline({ info, e2eeManager }),
      unpublishingFuture: new Future(),
    };
  },
};

export type DataTrackOutgoingManagerCallbacks = {
  /** Request sent to the SFU to publish a track. */
  sfuPublishRequest: (event: EventSfuPublishRequest) => void;
  /** Request sent to the SFU to unpublish a track. */
  sfuUnpublishRequest: (event: EventSfuUnpublishRequest) => void;
  /** A serialized packet is ready to be sent over the transport. */
  packetAvailable: (event: EventPacketAvailable) => void;
  /** A new {@link LocalDataTrack} has been published */
  trackPublished: (event: EventTrackPublished) => void;
  /** A {@link LocalDataTrack} has been unpublished */
  trackUnpublished: (event: EventTrackUnpublished) => void;
};

type OutgoingDataTrackManagerOptions = {
  /**
   * Provider to use for encrypting outgoing frame payloads.
   *
   * If null, end-to-end encryption will be disabled for all published tracks.
   */
  e2eeManager?: BaseE2EEManager;
};

/** How long to wait when attempting to publish before timing out. */
const PUBLISH_TIMEOUT_MILLISECONDS = 10_000;

export default class OutgoingDataTrackManager extends (EventEmitter as new () => TypedEmitter<DataTrackOutgoingManagerCallbacks>) {
  private e2eeManager: BaseE2EEManager | null;

  private handleAllocator = new DataTrackHandleAllocator();

  private descriptors = new Map<DataTrackHandle, Descriptor>();

  constructor(options?: OutgoingDataTrackManagerOptions) {
    super();
    this.e2eeManager = options?.e2eeManager ?? null;
  }

  static withDescriptors(descriptors: Map<DataTrackHandle, Descriptor>) {
    const manager = new OutgoingDataTrackManager();
    manager.descriptors = descriptors;
    return manager;
  }

  /** @internal */
  updateE2eeManager(e2eeManager: BaseE2EEManager | null) {
    this.e2eeManager = e2eeManager;

    // Propegate downwards to all pre-existing pipelines
    for (const descriptor of this.descriptors.values()) {
      if (descriptor.type === 'active') {
        descriptor.pipeline.updateE2eeManager(e2eeManager);
      }
    }
  }

  /**
   * Used by attached {@link LocalDataTrack} instances to query their associated descriptor info.
   * @internal
   */
  getDescriptor(handle: DataTrackHandle) {
    return this.descriptors.get(handle) ?? null;
  }

  /** Used by attached {@link LocalDataTrack} instances to broadcast data track packets to other
   * subscribers.
   * @internal
   */
  async tryProcessAndSend(
    handle: DataTrackHandle,
    frame: DataTrackFrameInternal,
  ): Promise<
    Throws<
      void,
      | DataTrackPushFrameError<DataTrackPushFrameErrorReason.Dropped>
      | DataTrackPushFrameError<DataTrackPushFrameErrorReason.TrackUnpublished>
    >
  > {
    const descriptor = this.getDescriptor(handle);
    if (descriptor?.type !== 'active') {
      throw DataTrackPushFrameError.trackUnpublished();
    }

    if (descriptor.publishState === 'unpublished') {
      throw DataTrackPushFrameError.trackUnpublished();
    }
    if (descriptor.publishState === 'republishing') {
      throw DataTrackPushFrameError.dropped('Data track republishing');
    }

    try {
      for await (const packet of descriptor.pipeline.processFrame(frame)) {
        this.emit('packetAvailable', { bytes: packet.toBinary() });
      }
    } catch (err) {
      // NOTE: In the rust implementation this "dropped" error means something different (not enough room
      // in the track mpsc channel)
      throw DataTrackPushFrameError.dropped(err);
    }
  }

  /**
   * Client requested to publish a track.
   *
   * If the LiveKit server is too old and doesn't support data tracks, a
   * {@link DataTrackPublishError#timeout} will be thrown.
   *
   * @internal
   **/
  async publishRequest(
    options: DataTrackOptions,
    signal?: AbortSignal,
  ): Promise<Throws<DataTrackHandle, DataTrackPublishError>> {
    const handle = this.handleAllocator.get();
    if (!handle) {
      throw DataTrackPublishError.limitReached();
    }

    const timeoutSignal = abortSignalTimeout(PUBLISH_TIMEOUT_MILLISECONDS);
    const combinedSignal = signal ? abortSignalAny([signal, timeoutSignal]) : timeoutSignal;

    if (this.descriptors.has(handle)) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error('Descriptor for handle already exists');
    }

    const descriptor = Descriptor.pending();
    this.descriptors.set(handle, descriptor);

    const onAbort = () => {
      const existingDescriptor = this.descriptors.get(handle);
      if (!existingDescriptor) {
        log.warn(`No descriptor for ${handle}`);
        return;
      }
      this.descriptors.delete(handle);

      // Let the SFU know that the publish has been cancelled
      this.emit('sfuUnpublishRequest', { handle });

      if (existingDescriptor.type === 'pending') {
        existingDescriptor.completionFuture.reject?.(
          timeoutSignal.aborted
            ? DataTrackPublishError.timeout()
            : // NOTE: the below cancelled case was introduced by web / there isn't a corresponding case in the rust version.
              DataTrackPublishError.cancelled(),
        );
      }
    };
    if (combinedSignal.aborted) {
      onAbort(); // NOTE: this rejects `completionFuture`; the next line just returns the rejection
      return descriptor.completionFuture.promise.then(
        () => handle /* no-op, makes typescript happy */,
      );
    }
    combinedSignal.addEventListener('abort', onAbort);

    this.emit('sfuPublishRequest', {
      handle,
      name: options.name,
      usesE2ee: this.e2eeManager !== null,
    });

    await descriptor.completionFuture.promise;
    combinedSignal.removeEventListener('abort', onAbort);

    this.emit('trackPublished', {
      track: LocalDataTrack.withExplicitHandle(options, this, handle),
    });

    return handle;
  }

  /**
   * Get information about all currently published tracks.
   * @internal
   **/
  queryPublished() {
    const descriptorInfos = Array.from(this.descriptors.values())
      .filter((descriptor): descriptor is ActiveDescriptor => descriptor.type === 'active')
      .map((descriptor) => descriptor.info);

    return descriptorInfos;
  }

  /**
   * Client request to unpublish a track.
   * @internal
   **/
  async unpublishRequest(handle: DataTrackHandle) {
    const descriptor = this.descriptors.get(handle);
    if (!descriptor) {
      log.warn(`No descriptor for ${handle}`);
      return;
    }
    if (descriptor.type !== 'active') {
      log.warn(`Track ${handle} not active`);
      return;
    }

    this.emit('sfuUnpublishRequest', { handle });

    await descriptor.unpublishingFuture.promise;

    this.emit('trackUnpublished', { sid: descriptor.info.sid });
  }

  /**
   * SFU responded to a request to publish a data track.
   * @internal
   **/
  receivedSfuPublishResponse(handle: DataTrackHandle, result: SfuPublishResponseResult) {
    const descriptor = this.descriptors.get(handle);
    if (!descriptor) {
      log.warn(`No descriptor for ${handle}`);
      return;
    }
    this.descriptors.delete(handle);

    switch (descriptor.type) {
      case 'pending': {
        if (result.type === 'ok') {
          const info = result.data;
          const e2eeManager = info.usesE2ee ? this.e2eeManager : null;
          this.descriptors.set(info.pubHandle, Descriptor.active(info, e2eeManager));

          descriptor.completionFuture.resolve?.();
        } else {
          descriptor.completionFuture.reject?.(result.error);
        }
        return;
      }
      case 'active': {
        if (descriptor.publishState !== 'republishing') {
          log.warn(`Track ${handle} already active`);
          return;
        }
        if (result.type === 'error') {
          log.warn(`Republish failed for track ${handle}`);
          return;
        }

        log.debug(`Track ${handle} republished`);
        descriptor.info.sid = result.data.sid;
        descriptor.publishState = 'published';
        this.descriptors.set(descriptor.info.pubHandle, descriptor);
      }
    }
  }

  /**
   * SFU notification that a track has been unpublished.
   * @internal
   **/
  receivedSfuUnpublishResponse(handle: DataTrackHandle) {
    const descriptor = this.descriptors.get(handle);
    if (!descriptor) {
      log.warn(`No descriptor for ${handle}`);
      return;
    }
    this.descriptors.delete(handle);

    if (descriptor.type !== 'active') {
      log.warn(`Track ${handle} not active`);
      return;
    }

    descriptor.publishState = 'unpublished';
    descriptor.unpublishingFuture.resolve?.();
  }

  /** Republish all tracks.
   *
   * This must be sent after a full reconnect in order for existing publications
   * to be recognized by the SFU. Each republished track will be assigned a new SID.
   * @internal
   */
  sfuWillRepublishTracks() {
    for (const [handle, descriptor] of this.descriptors.entries()) {
      switch (descriptor.type) {
        case 'pending':
          // TODO: support republish for pending publications
          this.descriptors.delete(handle);
          descriptor.completionFuture.reject?.(DataTrackPublishError.disconnected());
          break;
        case 'active':
          descriptor.publishState = 'republishing';

          this.emit('sfuPublishRequest', {
            handle: descriptor.info.pubHandle,
            name: descriptor.info.name,
            usesE2ee: descriptor.info.usesE2ee,
          });
      }
    }
  }

  /**
   * Shuts down the manager and all associated tracks.
   * @internal
   **/
  async shutdown() {
    for (const descriptor of this.descriptors.values()) {
      switch (descriptor.type) {
        case 'pending':
          descriptor.completionFuture.reject?.(DataTrackPublishError.disconnected());
          break;
        case 'active':
          // Abandon any unpublishing descriptors that were in flight and assume they will get
          // cleaned up automatically with the connection shutdown.
          descriptor.unpublishingFuture.resolve?.();

          await this.unpublishRequest(descriptor.info.pubHandle);
          break;
      }
    }
    this.descriptors.clear();
  }
}
