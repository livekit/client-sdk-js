import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { LoggerNames, getLogger } from '../../../logger';
import type { DecryptionProvider, EncryptedPayload } from '../e2ee';
import { type DataTrackInfo, type DataTrackSid } from '../types';
import type Participant from '../../participant/Participant';
import { DataTrackHandle } from '../handle';
import { Future } from '../../utils';
import { LivekitReasonedError } from '../../errors';
import type { Throws } from '../../../utils/throws';
import { DataTrackPacket } from '../packet';
import type { DataTrackFrame } from '../frame';
import DataTrackDepacketizer, { DataTrackDepacketizerDropError } from '../depacketizer';
import RemoteDataTrack from '../RemoteDataTrack';

const log = getLogger(LoggerNames.DataTracks);

/**
 * Options for creating a {@link IncomingDataTrackPipeline}.
 */
export type PipelineOptions = {
  info: DataTrackInfo;
  publisherIdentity: string;
  decryptionProvider: DecryptionProvider | null;
};

/**
 * Pipeline for an individual data track subscription.
 */
export class IncomingDataTrackPipeline {
  private publisherIdentity: string;
  private e2eeProvider: DecryptionProvider | null;
  private depacketizer: DataTrackDepacketizer;

  /**
   * Creates a new pipeline with the given options.
   */
  constructor(options: PipelineOptions) {
    // Equivalent to debug_assert_eq!
    const hasProvider = options.decryptionProvider !== null;
    if (options.info.usesE2ee !== hasProvider) {
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error(
        "IncomingDataTrackPipeline: DataTrackInfo.usesE2ee must match presence of decryptionProvider"
      );
    }

    const depacketizer = new DataTrackDepacketizer();

    this.publisherIdentity = options.publisherIdentity;
    this.e2eeProvider = options.decryptionProvider ?? null;
    this.depacketizer = depacketizer;
  }

  processPacket(packet: DataTrackPacket): DataTrackFrame | null {
    const frame = this.depacketize(packet);
    if (!frame) {
      return null;
    }

    const decrypted = this.decryptIfNeeded(frame);
    if (!decrypted) {
      return null;
    }

    return decrypted;
  }

  /**
   * Depacketize the given frame, log if a drop occurs.
   */
  private depacketize(packet: DataTrackPacket): Throws<DataTrackFrame | null, DataTrackDepacketizerDropError> {
    let frame: DataTrackFrame | null;
    try {
      frame = this.depacketizer.push(packet);
    } catch (err) {
      // In a future version, use this to maintain drop statistics.
      // FIXME: is this a good idea?
      log.debug(`Data frame depacketize error: ${err}`);
      return null;
    }
    return frame;
  }

  /**
   * Decrypt the frame's payload if E2EE is enabled for this track.
   */
  private decryptIfNeeded(
    frame: DataTrackFrame
  ): DataTrackFrame | null {
    const decryption = this.e2eeProvider;

    if (!decryption) {
      return frame;
    }

    const e2ee = frame.extensions?.e2ee ?? null;
    if (!e2ee) {
      log.error("Missing E2EE meta");
      return null;
    }

    const encrypted: EncryptedPayload = {
      payload: frame.payload,
      iv: e2ee.iv,
      keyIndex: e2ee.keyIndex,
    };

    let result: Uint8Array;
    try {
      result = decryption.decrypt(encrypted, this.publisherIdentity);
    } catch (err) {
      log.error(`Error decrypting packet: ${err}`);
      return null;
    }

    frame.payload = result;
    return frame;
  }
}

export type DataTrackStreamReaderReadAllOptions = {
  /** An AbortSignal can be used to terminate reads early. */
  signal?: AbortSignal;
};

// FIXME: maybe think about how to make this and the data streams one share a class hierarchy
// FIXME: maybe call it DataTrackSubscription?
// FIXME: revisit if this is even a good idea, maybe just modeling this as a ReadableStream is more
// straightforward... though it could potentially be less flexible.
class DataTrackStreamReader {
  protected reader: ReadableStream<DataTrackFrame>;

  protected _info: DataTrackInfo;

  protected outOfBandFailureRejectingFuture?: Future<never, Error>;

  protected signal?: AbortSignal;

  get info() {
    return this._info;
  }

  constructor(
    info: DataTrackInfo,
    stream: ReadableStream<DataTrackFrame>,
    outOfBandFailureRejectingFuture?: Future<never, Error>,
  ) {
    this.reader = stream;
    this._info = info;
    this.outOfBandFailureRejectingFuture = outOfBandFailureRejectingFuture;
  }

  [Symbol.asyncIterator]() {
    const reader = this.reader.getReader();

    let rejectingSignalFuture = new Future<never, Error>();
    let activeSignal: AbortSignal | null = null;
    let onAbort: (() => void) | null = null;
    if (this.signal) {
      const signal = this.signal;
      onAbort = () => {
        rejectingSignalFuture.reject?.(signal.reason);
      };
      signal.addEventListener('abort', onAbort);
      activeSignal = signal;
    }

    const cleanup = () => {
      reader.releaseLock();

      if (activeSignal && onAbort) {
        activeSignal.removeEventListener('abort', onAbort);
      }

      this.signal = undefined;
    };

    return {
      next: async (): Promise<IteratorResult<DataTrackFrame>> => {
        try {
          const { done, value } = await Promise.race([
            reader.read(),
            // Rejects if this.signal is aborted
            rejectingSignalFuture.promise,
            // Rejects if something external says it should, like a participant disconnecting, etc
            this.outOfBandFailureRejectingFuture?.promise ??
              new Promise<never>(() => {
                /* never resolves */
              }),
          ]);
          if (done) {
            return { done: true, value: undefined as any };
          } else {
            return { done: false, value };
          }
        } catch (err) {
          cleanup();
          throw err;
        }
      },

      // note: `return` runs only for premature exits, see:
      // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols#errors_during_iteration
      async return(): Promise<IteratorResult<DataTrackFrame>> {
        cleanup();
        return { done: true, value: undefined };
      },
    };
  }

  /**
   * Injects an AbortSignal, which if aborted, will terminate the currently active
   * stream iteration operation.
   *
   * Note that when using AbortSignal.timeout(...), the timeout applies across
   * the whole iteration operation, not just one individual chunk read.
   */
  withAbortSignal(signal: AbortSignal) {
    this.signal = signal;
    return this;
  }

  async readAll(opts: DataTrackStreamReaderReadAllOptions = {}): Promise<Array<DataTrackFrame>> {
    // FIXME: should this use Set here? Is the duplicate packet case important to handle here?
    let chunks: Set<DataTrackFrame> = new Set();
    const iterator = opts.signal ? this.withAbortSignal(opts.signal) : this;
    for await (const chunk of iterator) {
      chunks.add(chunk);
    }
    return Array.from(chunks);
  }
}

type SfuUpdateSubscription = {
  /** Identifier of the affected track. */
  sid: DataTrackSid,
  /** Whether to subscribe or unsubscribe. */
  subscribe: boolean,
};

export type DataTrackIncomingManagerCallbacks = {
  /** Request sent to the SFU to update the subscription for a data track.
  *
  * Protocol equivalent: [`livekit_protocol::UpdateDataSubscription`].
  */
  sfuUpdateSubscription: (event: SfuUpdateSubscription) => void;

  /** A track has been published by a remote participant and is available to be
  * subscribed to.
  *
  * Emit a public event to deliver the track to the user, allowing them to subscribe
  * with [`RemoteDataTrack::subscribe`] if desired.
  */
  trackAvailable: (event: {track: RemoteDataTrack}) => void;
};

export enum DataTrackSubscribeErrorReason {
  Unpublished = 0,
  Timeout = 1,
  Disconnected = 2,
  // Internal = 3,
  Cancelled = 4,
}

export class DataTrackSubscribeError<
  Reason extends DataTrackSubscribeErrorReason = DataTrackSubscribeErrorReason,
> extends LivekitReasonedError<Reason> {
  readonly name = 'DataTrackSubscribeError';

  reason: Reason;

  reasonName: string;

  constructor(message: string, reason: Reason, options?: { cause?: unknown }) {
    super(22, message, options);
    this.reason = reason;
    this.reasonName = DataTrackSubscribeErrorReason[reason];
  }

  static unpublished() {
    return new DataTrackSubscribeError(
      'The track has been unpublished and is no longer available',
      DataTrackSubscribeErrorReason.Unpublished,
    );
  }

  static timeout() {
    return new DataTrackSubscribeError(
      'Request to subscribe to data track timed-out',
      DataTrackSubscribeErrorReason.Timeout,
    );
  }

  static disconnected() {
    return new DataTrackSubscribeError(
      'Cannot subscribe to data track when disconnected',
      DataTrackSubscribeErrorReason.Disconnected,
    );
  }

  // FIXME: this was introduced by web / there isn't a corresponding case in the rust version.
  static cancelled() {
    return new DataTrackSubscribeError(
      'Subscription to data track cancelled by caller',
      DataTrackSubscribeErrorReason.Cancelled,
    );
  }
}

/** Track is not subscribed to. */
type SubscriptionStateNone = { type: 'none' };
/** Track is being subscribed to, waiting for subscriber handle. */
type SubscriptionStatePending = {
  type: 'pending',
  completionFuture: Future<void, DataTrackSubscribeError>,
  /** The number of in flight requests waiting for this subscription state to go to "active". */
  pendingRequestCount: number,
  /** A function that when called, cancels the pending subscription and moves back to "none". */
  cancel: () => void;
};
/** Track has an active subscription. */
type SubscriptionStateActive = {
  type: 'active';
  subcriptionHandle: DataTrackHandle;
  pipeline: IncomingDataTrackPipeline;
  streamControllers: Set<ReadableStreamDefaultController<DataTrackFrame>>;
};

type SubscriptionState = SubscriptionStateNone | SubscriptionStatePending | SubscriptionStateActive;

/** Information and state for a remote data track. */
type Descriptor<S extends SubscriptionState> = {
  info: DataTrackInfo,
  publisherIdentity: Participant["identity"];
  // published_tx: watch::Sender<bool>,
  subscription: S,
}

type IncomingDataTrackManagerOptions = {
  /** Provider to use for decrypting incoming frame payloads.
   * If none, remote tracks using end-to-end encryption will not be available
   * for subscription.
   */
  decryptionProvider: DecryptionProvider | null;
}

/** How long to wait when attempting to subscribe before timing out. */
const SUBSCRIBE_TIMEOUT_MILLISECONDS = 10_000;

export default class IncomingDataTrackManager extends (EventEmitter as new () => TypedEmitter<DataTrackIncomingManagerCallbacks>) {
  private decryptionProvider: DecryptionProvider | null;

  /** Mapping between track SID and descriptor. */
  private descriptors = new Map<DataTrackSid, Descriptor<SubscriptionState>>();

  /** Mapping between subscriber handle and track SID.
  *
  * This is an index that allows track descriptors to be looked up
  * by subscriber handle in O(1) time—necessary for routing incoming packets.
  */
  private subscriptionHandles = new Map<DataTrackHandle, DataTrackSid>();

  constructor(options?: IncomingDataTrackManagerOptions) {
    super();
    this.decryptionProvider = options?.decryptionProvider ?? null;
  }

  /** Client requested to subscribe to a data track.
  *
  * This is sent when the user calls {@link RemoteDataTrack.subscribe}.
  *
  * Only the first request to subscribe to a given track incurs meaningful overhead; subsequent
  * requests simply attach an additional receiver to the broadcast channel, allowing them to consume
  * frames from the existing subscription pipeline.
  */
  async subscribeRequest(sid: DataTrackSid, signal?: AbortSignal): Promise<Throws<ReadableStream<DataTrackFrame>, DataTrackSubscribeError>> {
    const descriptor = this.descriptors.get(sid);
    if (!descriptor) {
      // FIXME: maybe this should be a DataTrackSubscribeError.disconnected()? That's what happens
      // here (on the caller end in the rust implementation):
      // https://github.com/livekit/rust-sdks/blob/ccdc012e40f9b2cf6b677c07da7061216eb93a89/livekit-datatrack/src/remote/mod.rs#L81

      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error('Cannot subscribe to unknown track');
    }

    const waitForCompletionFuture = async (descriptor: Descriptor<SubscriptionState>, signal?: AbortSignal) => {
      if (descriptor.subscription.type !== 'pending') {
        // @throws-transformer ignore - this should be treated as a "panic" and not be caught
        throw new Error(`Descriptor for track ${sid} is not pending, found ${descriptor.subscription.type}`);
      }

      const onAbort = () => {
        if (descriptor.subscription.type !== 'pending') {
          return;
        }
        descriptor.subscription.pendingRequestCount -= 1;
        if (descriptor.subscription.pendingRequestCount <= 0) {
          // No requests are still pending, so cancel the underlying pending `sfuUpdateSubscription`
          descriptor.subscription.cancel();
        }
      };

      signal?.addEventListener('abort', onAbort);
      await descriptor.subscription.completionFuture.promise;
      signal?.removeEventListener('abort', onAbort);

      return this.createReadableStream(sid);
    };

    switch (descriptor.subscription.type) {
      case 'none': {
        descriptor.subscription = {
          type: 'pending',
          completionFuture: new Future(),
          pendingRequestCount: 1,
          cancel: () => {
            const previousDescriptorSubscription = descriptor.subscription;
            descriptor.subscription = { type: 'none' };

            // Let the SFU know that the subscribe has been cancelled
            this.emit('sfuUpdateSubscription', { sid, subscribe: false });

            if (previousDescriptorSubscription.type === 'pending') {
              previousDescriptorSubscription.completionFuture.reject?.(
                timeoutSignal.aborted
                  ? DataTrackSubscribeError.timeout()
                  : // FIXME: the below cancelled case was introduced by web / there isn't a corresponding case in the rust version.
                    DataTrackSubscribeError.cancelled(),
              );
            }
          },
        };

        this.emit('sfuUpdateSubscription', { sid, subscribe: true });

        const timeoutSignal = AbortSignal.timeout(SUBSCRIBE_TIMEOUT_MILLISECONDS);
        const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

        // Wait for the subscription to complete, or time out if it takes too long
        const reader = await waitForCompletionFuture(descriptor, combinedSignal);
        return reader;
      }
      case 'pending': {
        descriptor.subscription.pendingRequestCount += 1;

        // Wait for the subscription to complete
        const reader = await waitForCompletionFuture(descriptor, signal);
        return reader;
      }
      case 'active': {
        return this.createReadableStream(sid);
      }
    }
  }

  /** Allocates a ReadableStream which emits when a new {@link DataTrackFrame} is received from the
    * SFU. */
  private createReadableStream(sid: DataTrackSid) {
    return new ReadableStream<DataTrackFrame>({
      // FIXME: explore setting "type" here:
      // https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/ReadableStream#type
      //
      // This would require ReadableStream<Uint8Array> though.

      start: (controller) => {
        const descriptor = this.descriptors.get(sid);
        if (!descriptor) {
          log.error(`Unknown track ${sid}`);
          return;
        }
        if (descriptor.subscription.type !== 'active') {
          log.error(`Subscription for track ${sid} is not active`);
          return;
        }

        descriptor.subscription.streamControllers.add(controller);
      },
      cancel: (controller) => {
        const descriptor = this.descriptors.get(sid);
        if (!descriptor) {
          log.warn(`Unknown track ${sid}, skipping cancel...`);
          return;
        }
        if (descriptor.subscription.type !== 'active') {
          log.warn(`Subscription for track ${sid} is not active, skipping cancel...`);
          return;
        }

        descriptor.subscription.streamControllers.delete(controller);
      },
    });
  }

  /** Client requested to unsubscribe from a data track. */
  unSubscribeRequest(sid: DataTrackSid) {
    const descriptor = this.descriptors.get(sid);
    if (!descriptor) {
      // FIXME: rust implementation returns here, not throws
      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      throw new Error('Cannot subscribe to unknown track');
    }

    if (descriptor.subscription.type !== 'active') {
      // FIXME: should this be an internal error?
      log.warn('Unexpected state');
      return;
    }

    // FIXME: this might be wrong? Shouldn't this only occur if it is the last subscription to
    // terminate?
    const previousDescriptorSubscription = descriptor.subscription;
    descriptor.subscription = { type: 'none' };
    this.subscriptionHandles.delete(previousDescriptorSubscription.subcriptionHandle);

    this.emit('sfuUpdateSubscription', { sid, subscribe: false });
  }

  /** SFU notification that track publications have changed.
  *
  * This event is produced from both [`livekit_protocol::JoinResponse`] and [`livekit_protocol::ParticipantUpdate`]
  * to provide a complete view of remote participants' track publications:
  *
  * - From a `JoinResponse`, it captures the initial set of tracks published when a participant joins.
  * - From a `ParticipantUpdate`, it captures subsequent changes (i.e., new tracks being
  *   published and existing tracks unpublished).
  *
  * See [`event_from_join`](super::proto::event_from_join) and
  *     [`event_from_participant_update`](super::proto::event_from_participant_update).
  */
  async sfuPublicationUpdates(updates: Map<Participant["identity"], Array<DataTrackInfo>>) {
    if (updates.size === 0) {
      return;
    }

    // Detect published track
    const sidsInUpdate = new Set<DataTrackSid>();
    for (const [publisherIdentity, infos] of updates.entries()) {
      for (const info of infos) {
        sidsInUpdate.add(info.sid);
        if (this.descriptors.has(info.sid)) {
          continue;
        }
        await this.handleTrackPublished(publisherIdentity, info);
      }
    }

    // Detect unpublished tracks
    let unpublishedSids =  Object.keys(this.descriptors).filter((sid) => !sidsInUpdate.has(sid));
    for (const sid of unpublishedSids) {
      this.handleTrackUnpublished(sid);
    }
  }
  async handleTrackPublished(publisherIdentity: Participant["identity"], info: DataTrackInfo) {
    if (this.descriptors.has(info.sid)) {
      log.error(`Existing descriptor for track ${info.sid}`);
      return;
    }
    let descriptor: Descriptor<SubscriptionStateNone> = {
      info,
      publisherIdentity,
      subscription: { type: 'none' },
    };
    this.descriptors.set(descriptor.info.sid, descriptor);

    const track = new RemoteDataTrack(descriptor.info, publisherIdentity, this);
    this.emit('trackAvailable', { track });
  }

  handleTrackUnpublished(sid: DataTrackSid) {
    const descriptor = this.descriptors.get(sid);
    if (!descriptor) {
      log.error(`Unknown track ${sid}`);
      return;
    }
    if (descriptor.subscription.type === 'active') {
      this.subscriptionHandles.delete(descriptor.subscription.subcriptionHandle);
    }
    // FIXME: send a message of some sort to notify that the track was unpublished?
    // _ = descriptor.published_tx.send(false);
  }

  /** SFU notification that handles have been assigned for requested subscriptions.
  *
  * Protocol equivalent: [`livekit_protocol::DataTrackSubscriberHandles`].
  */
  sfuSubscriberHandles(
    /** Mapping between track handles attached to incoming packets to the
    * track SIDs they belong to. */
    mapping: Map<DataTrackHandle, DataTrackSid>
  ) {
    for (const [handle, sid] of mapping.entries()) {
      this.registerSubscriberHandle(handle, sid);
    }
  }
  private registerSubscriberHandle(assignedHandle: DataTrackHandle, sid: DataTrackSid) {
    const descriptor = this.descriptors.get(sid);
    if (!descriptor) {
      log.error(`Unknown track ${sid}`);
      return;
    }
    switch (descriptor.subscription.type) {
      case 'none': {
        // Handle assigned when there is no pending or active subscription is unexpected.
        log.warn(`No subscription for ${sid}`);
        return;
      }
      case 'active': {
        // Update handle for an active subscription. This can occur following a full reconnect.
        descriptor.subscription.subcriptionHandle = assignedHandle;
        this.subscriptionHandles.set(assignedHandle, sid);
        return;
      }
      case 'pending': {
        const pipeline = new IncomingDataTrackPipeline({
          info: descriptor.info,
          publisherIdentity: descriptor.publisherIdentity,
          decryptionProvider: this.decryptionProvider,
        });

        const previousDescriptorSubscription = descriptor.subscription;
        descriptor.subscription = {
          type: 'active',
          subcriptionHandle: assignedHandle,
          pipeline,
          streamControllers: new Set(),
        };
        this.subscriptionHandles.set(assignedHandle, sid);

        previousDescriptorSubscription.completionFuture.resolve?.();
      }
    }
  }

  /** Packet has been received over the transport. */
  packetReceived(bytes: Uint8Array) {
    let packet: DataTrackPacket;
    try {
      [packet] = DataTrackPacket.fromBinary(bytes);
    } catch (err) {
      log.error(`Failed to deserialize packet: ${err}`);
      return;
    }

    const sid = this.subscriptionHandles.get(packet.header.trackHandle);
    if (!sid) {
      log.warn(`Unknown subscriber handle ${packet.header.trackHandle}`);
      return;
    }

    const descriptor = this.descriptors.get(sid);
    if (!descriptor) {
      log.error(`Missing descriptor for track ${sid}`);
      return;
    }

    if (descriptor.subscription.type !== 'active') {
      // FIXME: "without active subscription"?
      log.warn(`Received packet for track ${sid} without subscription`);
      return;
    }

    const frame = descriptor.subscription.pipeline.processPacket(packet);
    if (!frame) {
      // Not all packets have been received yet to form a complete frame
      return;
    }
    
    // Broadcast to all downstream subscribers
    for (const controller of descriptor.subscription.streamControllers) {
      controller.enqueue(frame);
    }
  }

  /** Resend all subscription updates.
  *
  * This must be sent after a full reconnect to ensure the SFU knows which
  * tracks are subscribed to locally.
  */
  resendSubscriptionUpdates() {
    for (const [sid, descriptor] of this.descriptors) {
      if (descriptor.subscription.type === "none") {
        continue;
      }
      this.emit("sfuUpdateSubscription", { sid, subscribe: true });
    }
  }

  /** Shutdown the manager, ending any subscriptions. */
  shutdown() {
    for (const descriptor of this.descriptors.values()) {
      // FIXME: send a message of some sort to notify that the track was unpublished?
      // _ = descriptor.published_tx.send(false);

      if (descriptor.subscription.type === 'pending') {
        descriptor.subscription.completionFuture.reject?.(DataTrackSubscribeError.disconnected());
      }
    }
  }
}
