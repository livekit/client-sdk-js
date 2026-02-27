import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { LoggerNames, getLogger } from '../../../logger';
import { abortSignalAny, abortSignalTimeout } from '../../../utils/abort-signal-polyfill';
import type { Throws } from '../../../utils/throws';
import { Future } from '../../utils';
import LocalDataTrack from '../LocalDataTrack';
import { type EncryptionProvider } from '../e2ee';
import type { DataTrackFrame } from '../frame';
import { DataTrackHandle, DataTrackHandleAllocator } from '../handle';
import { DataTrackExtensions } from '../packet/extensions';
import { type DataTrackInfo } from '../types';
import {
  DataTrackPublishError,
  DataTrackPublishErrorReason,
  DataTrackPushFrameError,
  DataTrackPushFrameErrorReason,
} from './errors';
import DataTrackOutgoingPipeline from './pipeline';
import {
  type DataTrackOptions,
  type OutputEventPacketsAvailable,
  type OutputEventSfuPublishRequest,
  type OutputEventSfuUnpublishRequest,
  type SfuPublishResponseResult,
} from './types';

const log = getLogger(LoggerNames.DataTracks);

export type PendingDescriptor = {
  type: 'pending';
  completionFuture: Future<
    LocalDataTrack,
    | DataTrackPublishError<DataTrackPublishErrorReason.NotAllowed>
    | DataTrackPublishError<DataTrackPublishErrorReason.DuplicateName>
    | DataTrackPublishError<DataTrackPublishErrorReason.Timeout>
    | DataTrackPublishError<DataTrackPublishErrorReason.LimitReached>
    | DataTrackPublishError<DataTrackPublishErrorReason.Disconnected>
    | DataTrackPublishError<DataTrackPublishErrorReason.Cancelled>
  >;
};
export type ActiveDescriptor = {
  type: 'active';
  info: DataTrackInfo;

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
  active(info: DataTrackInfo, encryptionProvider: EncryptionProvider | null): ActiveDescriptor {
    return {
      type: 'active',
      info,
      pipeline: new DataTrackOutgoingPipeline({ info, encryptionProvider }),
      unpublishingFuture: new Future(),
    };
  },
};

export type DataTrackOutgoingManagerCallbacks = {
  /** Request sent to the SFU to publish a track. */
  sfuPublishRequest: (event: OutputEventSfuPublishRequest) => void;
  /** Request sent to the SFU to unpublish a track. */
  sfuUnpublishRequest: (event: OutputEventSfuUnpublishRequest) => void;
  /** Serialized packets are ready to be sent over the transport. */
  packetsAvailable: (event: OutputEventPacketsAvailable) => void;
};

type OutgoingDataTrackManagerOptions = {
  /**
   * Provider to use for encrypting outgoing frame payloads.
   *
   * If none, end-to-end encryption will be disabled for all published tracks.
   */
  encryptionProvider?: EncryptionProvider;
};

/** How long to wait when attempting to publish before timing out. */
const PUBLISH_TIMEOUT_MILLISECONDS = 10_000;

export default class OutgoingDataTrackManager extends (EventEmitter as new () => TypedEmitter<DataTrackOutgoingManagerCallbacks>) {
  private encryptionProvider: EncryptionProvider | null;

  private handleAllocator = new DataTrackHandleAllocator();

  private descriptors = new Map<DataTrackHandle, Descriptor>();

  constructor(options?: OutgoingDataTrackManagerOptions) {
    super();
    this.encryptionProvider = options?.encryptionProvider ?? null;
  }

  static withDescriptors(descriptors: Map<DataTrackHandle, Descriptor>) {
    const manager = new OutgoingDataTrackManager();
    manager.descriptors = descriptors;
    return manager;
  }

  /**
   * Used by attached {@link LocalDataTrack} instances to query their associated descriptor info.
   * @internal
   */
  getDescriptor(handle: DataTrackHandle) {
    return this.descriptors.get(handle) ?? null;
  }

  createLocalDataTrack(handle: DataTrackHandle) {
    const descriptor = this.getDescriptor(handle);
    if (descriptor?.type !== 'active') {
      return null;
    }
    return new LocalDataTrack(descriptor.info, this);
  }

  /** Used by attached {@link LocalDataTrack} instances to broadcast data track packets to other
   * subscribers.
   * @internal
   */
  tryProcessAndSend(
    handle: DataTrackHandle,
    payload: Uint8Array,
  ): Throws<
    void,
    | DataTrackPushFrameError<DataTrackPushFrameErrorReason.Dropped>
    | DataTrackPushFrameError<DataTrackPushFrameErrorReason.TrackUnpublished>
  > {
    const descriptor = this.getDescriptor(handle);
    if (descriptor?.type !== 'active') {
      throw DataTrackPushFrameError.trackUnpublished();
    }

    const frame: DataTrackFrame = {
      payload,
      extensions: new DataTrackExtensions(),
    };

    try {
      for (const packet of descriptor.pipeline.processFrame(frame)) {
        this.emit('packetsAvailable', { bytes: packet.toBinary() });
      }
    } catch (err) {
      // NOTE: In the rust implementation this "dropped" error means something different (not enough room
      // in the track mpsc channel)
      throw DataTrackPushFrameError.dropped(err);
    }
  }

  /** Client requested to publish a track. */
  async publishRequest(options: DataTrackOptions, signal?: AbortSignal) {
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
      return descriptor.completionFuture.promise;
    }
    combinedSignal.addEventListener('abort', onAbort);

    this.emit('sfuPublishRequest', {
      handle,
      name: options.name,
      usesE2ee: this.encryptionProvider !== null,
    });

    const localDataTrack = await descriptor.completionFuture.promise;
    combinedSignal.removeEventListener('abort', onAbort);
    return localDataTrack;
  }

  /** Get information about all currently published tracks. */
  async queryPublished() {
    const descriptorInfos = Array.from(this.descriptors.values())
      .filter((descriptor): descriptor is ActiveDescriptor => descriptor.type === 'active')
      .map((descriptor) => descriptor.info);

    return descriptorInfos;
  }

  /** Client request to unpublish a track. */
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
  }

  /** SFU responded to a request to publish a data track. */
  receivedSfuPublishResponse(handle: DataTrackHandle, result: SfuPublishResponseResult) {
    const descriptor = this.descriptors.get(handle);
    if (!descriptor) {
      log.warn(`No descriptor for ${handle}`);
      return;
    }
    this.descriptors.delete(handle);

    if (descriptor.type !== 'pending') {
      log.warn(`Track ${handle} already active`);
      return;
    }

    if (result.type === 'ok') {
      const info = result.data;

      const encryptionProvider = info.usesE2ee ? this.encryptionProvider : null;
      this.descriptors.set(info.pubHandle, Descriptor.active(info, encryptionProvider));

      const localDataTrack = this.createLocalDataTrack(info.pubHandle);
      if (!localDataTrack) {
        // @throws-transformer ignore - this should be treated as a "panic" and not be caught
        throw new Error(
          'DataTrackOutgoingManager.handleSfuPublishResponse: localDataTrack was not created after active descriptor stored.',
        );
      }

      descriptor.completionFuture.resolve?.(localDataTrack);
    } else {
      descriptor.completionFuture.reject?.(result.error);
    }
  }

  /** SFU notification that a track has been unpublished. */
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

    descriptor.unpublishingFuture.resolve?.();
  }

  /** Shuts down the manager and all associated tracks. */
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
