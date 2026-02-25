import { type JoinResponse, type ParticipantUpdate } from '@livekit/protocol';
import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import { LoggerNames, getLogger } from '../../../logger';
import { abortSignalAny, abortSignalTimeout } from '../../../utils/abort-signal-polyfill';
import type { Throws } from '../../../utils/throws';
import type Participant from '../../participant/Participant';
import { Future } from '../../utils';
import RemoteDataTrack from '../RemoteDataTrack';
import { DataTrackDepacketizerDropError } from '../depacketizer';
import type { DecryptionProvider } from '../e2ee';
import type { DataTrackFrame } from '../frame';
import { DataTrackHandle } from '../handle';
import { DataTrackPacket } from '../packet';
import { type DataTrackInfo, type DataTrackSid } from '../types';
import { DataTrackSubscribeError } from './errors';
import IncomingDataTrackPipeline from './pipeline';
import type RemoteParticipant from '../../participant/RemoteParticipant';

const log = getLogger(LoggerNames.DataTracks);

type SfuUpdateSubscription = {
  /** Identifier of the affected track. */
  sid: DataTrackSid;
  /** Whether to subscribe or unsubscribe. */
  subscribe: boolean;
};

export type DataTrackIncomingManagerCallbacks = {
  /** Request sent to the SFU to update the subscription for a data track. */
  sfuUpdateSubscription: (event: SfuUpdateSubscription) => void;

  /** A track has been published by a remote participant and is available to be
   * subscribed to. */
  trackAvailable: (event: { track: RemoteDataTrack }) => void;

  /** A track has been unpublished by a remote participant and can no longer be subscribed to. */
  trackUnavailable: (event: {
    sid: DataTrackSid;
    publisherIdentity: Participant['identity'];
  }) => void;
};

/** Track is not subscribed to. */
type SubscriptionStateNone = { type: 'none' };
/** Track is being subscribed to, waiting for subscriber handle. */
type SubscriptionStatePending = {
  type: 'pending';
  completionFuture: Future<void, DataTrackSubscribeError>;
  /** The number of in flight requests waiting for this subscription state to go to "active". */
  pendingRequestCount: number;
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
  info: DataTrackInfo;
  publisherIdentity: Participant['identity'];
  subscription: S;
};

type IncomingDataTrackManagerOptions = {
  /** Provider to use for decrypting incoming frame payloads.
   * If none, remote tracks using end-to-end encryption will not be available
   * for subscription.
   */
  decryptionProvider: DecryptionProvider | null;
};

/** How long to wait when attempting to subscribe before timing out. */
const SUBSCRIBE_TIMEOUT_MILLISECONDS = 10_000;

export default class IncomingDataTrackManager extends (EventEmitter as new () => TypedEmitter<DataTrackIncomingManagerCallbacks>) {
  private decryptionProvider: DecryptionProvider | null;

  /** Mapping between track SID and descriptor. */
  private descriptors = new Map<DataTrackSid, Descriptor<SubscriptionState>>();

  /** Mapping between subscriber handle and track SID.
   *
   * This is an index that allows track descriptors to be looked up
   * by subscriber handle in O(1) time, to make routing incoming packets
   * a (hot code path) faster.
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
  async subscribeRequest(
    sid: DataTrackSid,
    signal?: AbortSignal,
  ): Promise<
    Throws<
      ReadableStream<DataTrackFrame /* FIXME: should this be a frame? or just a packet? */>,
      DataTrackSubscribeError
    >
  > {
    const descriptor = this.descriptors.get(sid);
    if (!descriptor) {
      // FIXME: maybe this should be a DataTrackSubscribeError.disconnected()? That's what happens
      // here (on the caller end in the rust implementation):
      // https://github.com/livekit/rust-sdks/blob/ccdc012e40f9b2cf6b677c07da7061216eb93a89/livekit-datatrack/src/remote/mod.rs#L81
      throw DataTrackSubscribeError.disconnected();

      // FIXME: DataTrackSubscribeError.unpublished is unused both here and in rust

      // @throws-transformer ignore - this should be treated as a "panic" and not be caught
      // throw new Error('Cannot subscribe to unknown track');
    }

    const waitForCompletionFuture = async (
      currentDescriptor: Descriptor<SubscriptionState>,
      userProvidedSignal?: AbortSignal,
      timeoutSignal?: AbortSignal,
    ) => {
      if (currentDescriptor.subscription.type !== 'pending') {
        // @throws-transformer ignore - this should be treated as a "panic" and not be caught
        throw new Error(
          `Descriptor for track ${sid} is not pending, found ${currentDescriptor.subscription.type}`,
        );
      }

      const combinedSignal = abortSignalAny(
        [userProvidedSignal, timeoutSignal].filter(
          (s): s is AbortSignal => typeof s !== 'undefined',
        ),
      );

      const proxiedCompletionFuture = new Future<void, DataTrackSubscribeError>();
      currentDescriptor.subscription.completionFuture.promise
        .then(() => proxiedCompletionFuture.resolve?.())
        .catch((err) => proxiedCompletionFuture.reject?.(err));

      const onAbort = () => {
        if (currentDescriptor.subscription.type !== 'pending') {
          return;
        }
        currentDescriptor.subscription.pendingRequestCount -= 1;

        if (timeoutSignal?.aborted) {
          // A timeout should apply to the underlying SFU subscription and cancel all user
          // subscriptions.
          currentDescriptor.subscription.cancel();
          return;
        }

        if (currentDescriptor.subscription.pendingRequestCount <= 0) {
          // No user subscriptions are still pending, so cancel the underlying pending `sfuUpdateSubscription`
          currentDescriptor.subscription.cancel();
          return;
        }

        // Other subscriptions are still pending for this data track, so just cancel this one
        // active user subscription, and leave the rest of the user subscriptions alone.
        proxiedCompletionFuture.reject?.(DataTrackSubscribeError.cancelled());
      };

      if (combinedSignal.aborted) {
        onAbort();
      }
      combinedSignal.addEventListener('abort', onAbort);
      await proxiedCompletionFuture.promise;
      combinedSignal.removeEventListener('abort', onAbort);

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
                  : // NOTE: the below cancelled case was introduced by web / there isn't a corresponding case in the rust version.
                    DataTrackSubscribeError.cancelled(),
              );
            }
          },
        };

        this.emit('sfuUpdateSubscription', { sid, subscribe: true });

        const timeoutSignal = abortSignalTimeout(SUBSCRIBE_TIMEOUT_MILLISECONDS);

        // Wait for the subscription to complete, or time out if it takes too long
        const reader = await waitForCompletionFuture(descriptor, signal, timeoutSignal);
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
    let streamController: ReadableStreamDefaultController<DataTrackFrame> | null = null;
    return new ReadableStream<DataTrackFrame>({
      // FIXME: explore setting "type" here:
      // https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/ReadableStream#type
      //
      // This would require ReadableStream<Uint8Array> though.

      start: (controller) => {
        streamController = controller;
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
      cancel: () => {
        if (!streamController) {
          log.warn(`ReadableStream subscribed to ${sid} was not started.`);
          return;
        }
        const descriptor = this.descriptors.get(sid);
        if (!descriptor) {
          log.warn(`Unknown track ${sid}, skipping cancel...`);
          return;
        }
        if (descriptor.subscription.type !== 'active') {
          log.warn(`Subscription for track ${sid} is not active, skipping cancel...`);
          return;
        }

        descriptor.subscription.streamControllers.delete(streamController);

        // If no active stream controllers are left, also unsubscribe on the SFU end.
        if (descriptor.subscription.streamControllers.size === 0) {
          this.unSubscribeRequest(descriptor.info.sid);
        }
      },
    });
  }

  /**
   * Get information about all currently subscribed tracks.
   * @internal */
  async querySubscribed() {
    const descriptorInfos = Array.from(this.descriptors.values())
      .filter(
        (descriptor): descriptor is Descriptor<SubscriptionStateActive> =>
          descriptor.subscription.type === 'active',
      )
      .map(
        (descriptor) =>
          [descriptor.info, descriptor.publisherIdentity] as [
            info: DataTrackInfo,
            identity: Participant['identity'],
          ],
      );

    return descriptorInfos;
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
      log.warn(
        `Unexpected descriptor state in unSubscribeRequest, expected active, found ${descriptor.subscription?.type}`,
      );
      return;
    }

    for (const controller of descriptor.subscription.streamControllers) {
      controller.close();
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
   * This event is produced from both {@link JoinResponse} and {@link ParticipantUpdate}
   * to provide a complete view of remote participants' track publications:
   *
   * - From a `JoinResponse`, it captures the initial set of tracks published when a participant joins.
   * - From a `ParticipantUpdate`, it captures subsequent changes (i.e., new tracks being
   *   published and existing tracks unpublished).
   */
  async receiveSfuPublicationUpdates(updates: Map<Participant['identity'], Array<DataTrackInfo>>) {
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
    let unpublishedSids = Array.from(this.descriptors.keys()).filter(
      (sid) => !sidsInUpdate.has(sid),
    );
    for (const sid of unpublishedSids) {
      this.handleTrackUnpublished(sid);
    }
  }

  /**
   * Get information about all currently remotely published tracks which could be subscribed to.
   * @internal */
  async queryPublications() {
    return Array.from(this.descriptors.values()).map((descriptor) => descriptor.info);
  }

  async handleTrackPublished(publisherIdentity: Participant['identity'], info: DataTrackInfo) {
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

    const track = new RemoteDataTrack(descriptor.info, this, { publisherIdentity });
    this.emit('trackAvailable', { track });
  }

  handleTrackUnpublished(sid: DataTrackSid) {
    const descriptor = this.descriptors.get(sid);
    if (!descriptor) {
      log.error(`Unknown track ${sid}`);
      return;
    }
    this.descriptors.delete(sid);

    if (descriptor.subscription.type === 'active') {
      this.subscriptionHandles.delete(descriptor.subscription.subcriptionHandle);
    }

    this.emit('trackUnavailable', { sid, publisherIdentity: descriptor.publisherIdentity });
  }

  /** SFU notification that handles have been assigned for requested subscriptions. */
  receivedSfuSubscriberHandles(
    /** Mapping between track handles attached to incoming packets to the
     * track SIDs they belong to. */
    mapping: Map<DataTrackHandle, DataTrackSid>,
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
  packetReceived(bytes: Uint8Array): Throws<void, DataTrackDepacketizerDropError> {
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
      log.warn(`Received packet for track ${sid} without active subscription`);
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
      if (descriptor.subscription.type === 'none') {
        continue;
      }
      this.emit('sfuUpdateSubscription', { sid, subscribe: true });
    }
  }

  /** Called when a remote participant is disconnected so that any pending data tracks can be
    * cancelled. */
  remoteParticipantDisconnected(remoteParticipantIdentity: RemoteParticipant["identity"]) {
    for (const descriptor of this.descriptors.values()) {
      if (descriptor.publisherIdentity !== remoteParticipantIdentity) {
        continue;
      }
      switch (descriptor.subscription.type) {
        case 'none':
          break;
        case 'pending':
          descriptor.subscription.completionFuture.reject?.(
            DataTrackSubscribeError.disconnected()
          );
          break;
        case 'active':
          this.unSubscribeRequest(descriptor.info.sid);
          break;
      }
    }
  }

  /** Shutdown the manager, ending any subscriptions. */
  shutdown() {
    for (const descriptor of this.descriptors.values()) {
      this.emit('trackUnavailable', {
        sid: descriptor.info.sid,
        publisherIdentity: descriptor.publisherIdentity,
      });

      if (descriptor.subscription.type === 'pending') {
        descriptor.subscription.completionFuture.reject?.(DataTrackSubscribeError.disconnected());
      }
    }
  }
}
