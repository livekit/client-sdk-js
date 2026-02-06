import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { LivekitReasonedError } from '../../errors';
import { LoggerNames, getLogger } from '../../../logger';
import { Future } from '../../utils';
import { DataTrackHandle, DataTrackHandleAllocator } from '../handle';
import { type EncryptionProvider } from '../e2ee';

const log = getLogger(LoggerNames.DataTracks);

type LocalDataTrack = { info: DataTrackInfo };

type PendingDescriptor = {
  type: 'pending';
  completionFuture: Future<
    LocalDataTrack,
    | DataTrackPublishError<DataTrackPublishErrorReason.LimitReached>
    | DataTrackPublishError<DataTrackPublishErrorReason.Internal>
    | DataTrackPublishError<DataTrackPublishErrorReason.Disconnected>
    | DataTrackPublishError<DataTrackPublishErrorReason.Cancelled>
  >;
};
type ActiveDescriptor = {
  type: 'active';
  info: DataTrackInfo;
  // FIXME: add track task fields here.
};
type Descriptor = PendingDescriptor | ActiveDescriptor;

type DataTrackIncomingManagerCallbacks = {
  /** Request sent to the SFU to publish a track. */
  sfuPublishRequest: (event: {handle: DataTrackHandle, name: string, usesE2ee: boolean}) => void;
  /** Request sent to the SFU to unpublish a track. */
  sfuUnpublishRequest: (event: {handle: DataTrackHandle}) => void;
};

/** Options for publishing a data track. */
type DataTrackOptions = {
  name: string,
};

type DataTrackSid = string;

/** Information about a published data track. */
type DataTrackInfo = {
  sid: DataTrackSid,
  pubHandle: DataTrackHandle,
  name: String,
  usesE2ee: boolean,
};

type InputEventPublishRequest = {
  type: 'publishRequest';
  options: DataTrackOptions;
  signal?: AbortSignal;
};

type InputEventQueryPublished = {
  type: 'queryPublished',
  // FIXME: use onehsot future vs sending corresponding "-Response" event?
  future: Future<Array<DataTrackInfo>, never>;
};
type InputEventUnpublishRequest = { type: 'unpublishRequest', handle: DataTrackHandle };
type InputEventSfuPublishResponse = {
  type: 'sfuPublishResponse';
  handle: DataTrackHandle;
  result: (
    | { type: 'ok', data: DataTrackInfo }
    | { type: 'error', error: DataTrackPublishError<DataTrackPublishErrorReason.LimitReached> }
  );
};
type InputEventSfuUnPublishResponse = { type: 'sfuUnpublishResponse', handle: DataTrackHandle };
/** Shutdown the manager and all associated tracks. */
type InputEventShutdown = { type: 'shutdown' };

type InputEvent =
  | InputEventPublishRequest
  // FIXME: no cancelled event
  // | { type: 'publishCancelled', handle: DataTrackHandle }
  | InputEventQueryPublished
  | InputEventUnpublishRequest
  | InputEventSfuPublishResponse
  | InputEventSfuUnPublishResponse
  | InputEventShutdown;

type DataTrackLocalManagerOptions = {
  /**
   * Provider to use for encrypting outgoing frame payloads.
   *
   * If none, end-to-end encryption will be disabled for all published tracks.
   */
  decryptionProvider?: EncryptionProvider;
};

enum DataTrackPublishErrorReason {
  LimitReached,
  Internal,
  Disconnected,

  // FIXME: this was introduced by web / there isn't a corresponding case in the rust version.
  Cancelled,
}

class DataTrackPublishError<
  Reason extends DataTrackPublishErrorReason,
> extends LivekitReasonedError<DataTrackPublishErrorReason> {
  readonly name = 'DataTrackPublishError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(21, message, options);
    this.reason = reason;
    this.reasonName = DataTrackPublishErrorReason[reason];
  }

  static limitReached() {
    return new DataTrackPublishError('FIXME', DataTrackPublishErrorReason.LimitReached);
  }

  // FIXME: is this internal thing a good idea?
  static internal(cause: Error) {
    return new DataTrackPublishError('FIXME', DataTrackPublishErrorReason.Internal, { cause });
  }

  // FIXME: this was introduced by web / there isn't a corresponding case i nthe rust version.
  static cancelled() {
    return new DataTrackPublishError('FIXME', DataTrackPublishErrorReason.Cancelled);
  }

  static disconnected() {
    return new DataTrackPublishError('FIXME', DataTrackPublishErrorReason.Disconnected);
  }
}

export class DataTrackIncomingManager extends (EventEmitter as new () => TypedEmitter<DataTrackIncomingManagerCallbacks>) {
  private encryptionProvider: EncryptionProvider | null;
  private handleAllocator = new DataTrackHandleAllocator();
  // FIXME: key of this map is the same as the value Descriptor["info"]["pubHandle"]
  private descriptors = new Map<DataTrackHandle, Descriptor>();

  constructor(options: DataTrackLocalManagerOptions) {
    super();
    this.encryptionProvider = options.decryptionProvider ?? null;
  }

  async handle(event: InputEvent) {
    switch (event.type) {
      case 'publishRequest':
        return this.handlePublishRequest(event);
      case 'queryPublished':
        return this.handleQueryPublished(event);
      case 'unpublishRequest':
        return this.handleUnpublishRequest(event);
      case 'sfuPublishResponse':
        return this.handleSfuPublishResponse(event);
      case 'sfuUnpublishResponse':
        return this.handleSfuUnpublishResponse(event);
      case 'shutdown':
        return this.handleShutdown(event);
      default:
        // Make sure there is a typescript error if not all the input events are handled above.
        event satisfies never;

        // @throws-transformer ignore - this should be treated as a "panic" and not be caught
        throw new Error(`DataTrackLocalManager.handle: Unknown event type ${(event as InputEvent)?.type} found.`);
    }
  }

  /** Client requested to publish a track. */
  private async handlePublishRequest(event: InputEventPublishRequest) {
    const handle = this.handleAllocator.get();
    if (!handle) {
      throw DataTrackPublishError.limitReached();
    }

    if (this.descriptors.has(handle)) {
      throw DataTrackPublishError.internal(new Error('Descriptor for handle already exists'));
    }

    const descriptor: PendingDescriptor = { type: 'pending', completionFuture: new Future() };
    this.descriptors.set(handle, descriptor);

    const onAbort = () => {
      const existingDescriptor = this.descriptors.get(handle);
      if (!existingDescriptor) {
        // FIXME: should this be an internal error?
        log.warn(`No descriptor for ${handle}`);
        return;
      }
      this.descriptors.delete(handle);

      // FIXME: this was introduced by web / there isn't a corresponding case in the rust version.
      if (existingDescriptor.type === 'pending') {
        existingDescriptor.completionFuture.reject?.(DataTrackPublishError.cancelled());
      }
    };
    event.signal?.addEventListener('abort', onAbort);

    this.emit('sfuPublishRequest', {
      handle,
      name: event.options.name,
      usesE2ee: this.encryptionProvider === null,
    });

    const localDataTrack = await descriptor.completionFuture.promise;
    event.signal?.removeEventListener('abort', onAbort);
    return localDataTrack;
  }

  private handleQueryPublished(event: InputEventQueryPublished) {
    const descriptorInfos = Array.from(this.descriptors.values())
      .filter((descriptor): descriptor is ActiveDescriptor => descriptor.type === "active")
      .map(descriptor => descriptor.info);

    event.future.resolve?.(descriptorInfos);
  }

  /** Client request to unpublish a track. */
  private handleUnpublishRequest(event: InputEventUnpublishRequest) {
    this.removeDescriptorIfExists(event.handle);

    this.emit('sfuUnpublishRequest', { handle: event.handle });
  }

  /** SFU responded to a request to publish a data track. */
  private handleSfuPublishResponse(event: InputEventSfuPublishResponse) {
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
      descriptor.completionFuture.resolve?.(this.createLocalTrack(event.result.data));
    } else {
      descriptor.completionFuture.reject?.(event.result.error);
    }
  }

  /** SFU notification that a track has been unpublished. */
  private handleSfuUnpublishResponse(event: InputEventSfuUnPublishResponse) {
    this.removeDescriptorIfExists(event.handle);
  }

  /** Shuts down the manager and all associated tracks. */
  private handleShutdown(event: InputEventShutdown) {
    for (const descriptor of this.descriptors.values()) {
      switch (descriptor.type) {
        case 'pending':
          descriptor.completionFuture.reject?.(DataTrackPublishError.disconnected())
          break;
        case 'active':
          // FIXME: cleanup active descriptor
          break;
      }
    }
    this.descriptors.clear();
  }

  private createLocalTrack(info: DataTrackInfo) {
    // FIXME: initialize track task in here!

    this.descriptors.set(
      info.pubHandle,
      {
        type: 'active',
        info,
        // FIXME: add track task metadata in here!
        // published_tx,
        // task_handle,
      },
    );

    // FIXME: create local data track
    // let inner = LocalTrackInner { frame_tx, published_tx };
    // return LocalDataTrack::new(info, inner)
    return { info } as LocalDataTrack;
  }

  private removeDescriptorIfExists(handle: DataTrackHandle) {
    // FIXME: cleanup active descriptors, stop track task, etc
    this.descriptors.delete(handle);
  }
}
