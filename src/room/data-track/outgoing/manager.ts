import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { LoggerNames, getLogger } from '../../../logger';
import { LivekitReasonedError } from '../../errors';
import { Future } from '../../utils';
import { type EncryptionProvider } from '../e2ee';
import type { DataTrackFrame } from '../frame';
import { DataTrackHandle, DataTrackHandleAllocator } from '../handle';
import { DataTrackExtensions } from '../packet/extensions';
import { type DataTrackInfo, LocalDataTrack } from '../track';
import {
  type InputEventPublishRequest,
  type InputEventQueryPublished,
  type InputEventSfuPublishResponse,
  type InputEventSfuUnPublishResponse,
  type InputEventShutdown,
  type InputEventUnpublishRequest,
  type OutputEventPacketsAvailable,
  type OutputEventSfuPublishRequest,
  type OutputEventSfuUnpublishRequest,
} from './events';
import DataTrackOutgoingPipeline from './pipeline';

const log = getLogger(LoggerNames.DataTracks);

export type PendingDescriptor = {
  type: 'pending';
  completionFuture: Future<
    LocalDataTrack,
    | DataTrackPublishError<DataTrackPublishErrorReason.Timeout>
    | DataTrackPublishError<DataTrackPublishErrorReason.LimitReached>
    | DataTrackPublishError<DataTrackPublishErrorReason.Internal>
    | DataTrackPublishError<DataTrackPublishErrorReason.Disconnected>
    | DataTrackPublishError<DataTrackPublishErrorReason.Cancelled>
  >;
};
export type ActiveDescriptor = {
  type: 'active';
  info: DataTrackInfo;

  pipeline: DataTrackOutgoingPipeline;
};
// FIXME: rust doesn't have this unpublishing descriptor, is it a good idea?
export type UnpublishingDescriptor = {
  type: 'unpublishing';
  completionFuture: Future<void, never>;
};
export type Descriptor = PendingDescriptor | ActiveDescriptor | UnpublishingDescriptor;

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
    };
  },
  unpublishing(): UnpublishingDescriptor {
    return { type: 'unpublishing', completionFuture: new Future() };
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

type DataTrackLocalManagerOptions = {
  /**
   * Provider to use for encrypting outgoing frame payloads.
   *
   * If none, end-to-end encryption will be disabled for all published tracks.
   */
  decryptionProvider?: EncryptionProvider;
};

export enum DataTrackPublishErrorReason {
  /**
   * Local participant does not have permission to publish data tracks.
   *
   * Ensure the participant's token contains the `canPublishData` grant.
   */
  NotAllowed = 0,

  /** A track with the same name is already published by the local participant. */
  DuplicateName = 1,

  /** Request to publish the track took long to complete. */
  Timeout = 2,

  /** No additional data tracks can be published by the local participant. */
  LimitReached = 3,

  /** Cannot publish data track when the room is disconnected. */
  Disconnected = 4,

  /** Internal error, please report on GitHub. */
  Internal = 5,

  // FIXME: this was introduced by web / there isn't a corresponding case in the rust version.
  Cancelled = 6,
}

export class DataTrackPublishError<
  Reason extends DataTrackPublishErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackPublishError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(21, message, options);
    this.reason = reason;
    this.reasonName = DataTrackPublishErrorReason[reason];
  }

  static notAllowed() {
    return new DataTrackPublishError(
      'Data track publishing unauthorized',
      DataTrackPublishErrorReason.NotAllowed,
    );
  }

  static duplicateName() {
    return new DataTrackPublishError(
      'Track name already taken',
      DataTrackPublishErrorReason.DuplicateName,
    );
  }

  static timeout() {
    return new DataTrackPublishError(
      'Publish data track timed-out',
      DataTrackPublishErrorReason.Timeout,
    );
  }

  static limitReached() {
    return new DataTrackPublishError(
      'Data track publication limit reached',
      DataTrackPublishErrorReason.LimitReached,
    );
  }

  static disconnected() {
    return new DataTrackPublishError('Room disconnected', DataTrackPublishErrorReason.Disconnected);
  }

  // FIXME: is this internal thing a good idea?
  static internal(cause: Error) {
    return new DataTrackPublishError('FIXME', DataTrackPublishErrorReason.Internal, { cause });
  }

  // FIXME: this was introduced by web / there isn't a corresponding case in the rust version.
  static cancelled() {
    return new DataTrackPublishError(
      'Publish data track cancelled by caller',
      DataTrackPublishErrorReason.Cancelled,
    );
  }
}

/** How long to wait when attempting to publish before timing out. */
const PUBLISH_TIMEOUT_MILLISECONDS = 10_000;

export default class DataTrackOutgoingManager extends (EventEmitter as new () => TypedEmitter<DataTrackOutgoingManagerCallbacks>) {
  private encryptionProvider: EncryptionProvider | null;
  private handleAllocator = new DataTrackHandleAllocator();
  // FIXME: key of this map is the same as the value Descriptor["info"]["pubHandle"]
  private descriptors = new Map<DataTrackHandle, Descriptor>();

  constructor(options?: DataTrackLocalManagerOptions) {
    super();
    this.encryptionProvider = options?.decryptionProvider ?? null;
  }

  static withDescriptors(descriptors: Map<DataTrackHandle, Descriptor>) {
    const manager = new DataTrackOutgoingManager();
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
    options?: { signal?: AbortSignal },
  ) {
    const descriptor = this.getDescriptor(handle);
    if (descriptor?.type !== 'active') {
      // return Err(PushFrameError::new(frame, PushFrameErrorReason::TrackUnpublished));
      throw new Error('Pipeline not created, local data track not yet published.');
    }

    const frame: DataTrackFrame = {
      payload,
      extensions: new DataTrackExtensions(),
    };

    // FIXME: catch and drop processFrame error? That is what the rust implementation is doing.
    // .inspect_err(|err| log::debug!("Process failed: {}", err))
    for (const packet of descriptor.pipeline.processFrame(frame)) {
      // .inspect_err(|err| log::debug!("Cannot send packet to transport: {}", err));
      this.emit('packetsAvailable', { bytes: packet.toBinary(), signal: options?.signal });
    }
  }

  // FIXME: reintroduce bare handle? Or convert to completely seperate handle implementations for
  // each event (and if so, drop the `type` params from `event`)?

  /** Client requested to publish a track. */
  async handlePublishRequest(event: InputEventPublishRequest) {
    const handle = this.handleAllocator.get();
    if (!handle) {
      throw DataTrackPublishError.limitReached();
    }

    const timeoutSignal = AbortSignal.timeout(PUBLISH_TIMEOUT_MILLISECONDS);
    const combinedSignal = event.signal
      ? AbortSignal.any([event.signal, timeoutSignal])
      : timeoutSignal;

    if (this.descriptors.has(handle)) {
      throw DataTrackPublishError.internal(new Error('Descriptor for handle already exists'));
    }

    const descriptor = Descriptor.pending();
    this.descriptors.set(handle, descriptor);

    const onAbort = () => {
      const existingDescriptor = this.descriptors.get(handle);
      if (!existingDescriptor) {
        // FIXME: should this be an internal error?
        log.warn(`No descriptor for ${handle}`);
        return;
      }
      this.descriptors.delete(handle);

      if (existingDescriptor.type === 'pending') {
        existingDescriptor.completionFuture.reject?.(
          timeoutSignal.aborted
            ? DataTrackPublishError.timeout()
            : // FIXME: the below cancelled case was introduced by web / there isn't a corresponding case in the rust version.
              DataTrackPublishError.cancelled(),
        );
      }
    };
    combinedSignal.addEventListener('abort', onAbort);

    this.emit('sfuPublishRequest', {
      handle,
      name: event.options.name,
      usesE2ee: this.encryptionProvider !== null,
    });

    const localDataTrack = await descriptor.completionFuture.promise;
    combinedSignal.removeEventListener('abort', onAbort);
    return localDataTrack;
  }

  handleQueryPublished(event: InputEventQueryPublished) {
    const descriptorInfos = Array.from(this.descriptors.values())
      .filter((descriptor): descriptor is ActiveDescriptor => descriptor.type === 'active')
      .map((descriptor) => descriptor.info);

    event.future.resolve?.(descriptorInfos);
  }

  /** Client request to unpublish a track. */
  async handleUnpublishRequest(event: InputEventUnpublishRequest) {
    const descriptor = Descriptor.unpublishing();
    this.descriptors.set(event.handle, descriptor);

    this.emit('sfuUnpublishRequest', { handle: event.handle });

    await descriptor.completionFuture.promise;
  }

  /** SFU responded to a request to publish a data track. */
  handleSfuPublishResponse(event: InputEventSfuPublishResponse) {
    const descriptor = this.descriptors.get(event.handle);
    if (!descriptor) {
      // FIXME: should this be an internal error?
      log.warn(`No descriptor for ${event.handle}`);
      return;
    }
    this.descriptors.delete(event.handle);

    if (descriptor.type !== 'pending') {
      log.warn(`Track ${event.handle} already active`);
      return;
    }

    if (event.result.type === 'ok') {
      const info = event.result.data;

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
      descriptor.completionFuture.reject?.(event.result.error);
    }
  }

  /** SFU notification that a track has been unpublished. */
  handleSfuUnpublishResponse(event: InputEventSfuUnPublishResponse) {
    const descriptor = this.descriptors.get(event.handle);
    if (!descriptor) {
      // FIXME: should this be an internal error?
      log.warn(`No descriptor for ${event.handle}`);
      return;
    }
    this.descriptors.delete(event.handle);

    if (descriptor.type !== 'unpublishing') {
      log.warn(`Track ${event.handle} hasn't been put into unpublishing status`);
      return;
    }

    descriptor.completionFuture.resolve?.();
  }

  /** Shuts down the manager and all associated tracks. */
  async handleShutdown(_event: InputEventShutdown) {
    for (const descriptor of this.descriptors.values()) {
      switch (descriptor.type) {
        case 'pending':
          descriptor.completionFuture.reject?.(DataTrackPublishError.disconnected());
          break;
        case 'active':
          await this.handleUnpublishRequest({ type: 'unpublishRequest', handle: descriptor.info.pubHandle });
          break;
      }
    }
    this.descriptors.clear();
  }
}
