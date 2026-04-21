/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { type DataTrackFrame } from '../frame';
import { DataTrackHandle, DataTrackHandleAllocator } from '../handle';
import { PrefixingEncryptionProvider } from '../outgoing/OutgoingDataTrackManager.test';
import { DataTrackPacket, DataTrackPacketHeader, FrameMarker } from '../packet';
import { DataTrackE2eeExtension, DataTrackExtensions } from '../packet/extensions';
import { DataTrackTimestamp, WrapAroundUnsignedInt } from '../utils';
import IncomingDataTrackManager, {
  type DataTrackIncomingManagerCallbacks,
} from './IncomingDataTrackManager';
import { DataTrackSubscribeError } from './errors';

describe('DataTrackIncomingManager', () => {
  describe('Track publication', () => {
    it('should test track publication additions / removals', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
        'trackUnpublished',
      ]);

      // 1. Add a track, make sure the track available event was sent
      await manager.receiveSfuPublicationUpdates(
        new Map([
          [
            'identity1',
            [
              {
                sid: 'sid1',
                pubHandle: DataTrackHandle.fromNumber(5),
                name: 'test',
                usesE2ee: false,
              },
            ],
          ],
        ]),
      );

      const trackPublishedEvent = await managerEvents.waitFor('trackPublished');
      expect(trackPublishedEvent.track.info.sid).toStrictEqual('sid1');
      expect(trackPublishedEvent.track.info.pubHandle).toStrictEqual(DataTrackHandle.fromNumber(5));
      expect(trackPublishedEvent.track.info.name).toStrictEqual('test');
      expect(trackPublishedEvent.track.info.usesE2ee).toStrictEqual(false);

      // 2. Check to make sure the publication has been noted in internal state
      expect((await manager.queryPublications()).map((p) => p.pubHandle)).to.deep.equal([
        DataTrackHandle.fromNumber(5),
      ]);

      // 3. Remove all tracks, and make sure the internal state is cleared
      await manager.receiveSfuPublicationUpdates(new Map([['identity1', []]]));
      expect(await manager.queryPublications()).to.deep.equal([]);

      const trackUnpublishedEvent = await managerEvents.waitFor('trackUnpublished');
      expect(trackUnpublishedEvent.sid).toStrictEqual('sid1');
      expect(trackUnpublishedEvent.publisherIdentity).toStrictEqual('identity1');
    });

    it('should process sfu publication updates idempotently', async () => {
      const manager = new IncomingDataTrackManager();

      // 1. Simulate three identical track publications being received
      for (let i = 0; i < 3; i += 1) {
        await manager.receiveSfuPublicationUpdates(
          new Map([
            [
              'identity1',
              [
                {
                  sid: 'sid1',
                  pubHandle: DataTrackHandle.fromNumber(5),
                  name: 'test',
                  usesE2ee: false,
                },
              ],
            ],
          ]),
        );
      }

      // 2. Check to make sure the publication has been noted in internal state only once
      expect((await manager.queryPublications()).map((p) => p.pubHandle)).to.deep.equal([
        DataTrackHandle.fromNumber(5),
      ]);
    });
  });

  describe('Track subscription', () => {
    it('should test data track subscribing (ok case)', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Create a subscription readable stream (SFU subscription starts lazily in the background)
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(sid);
      const reader = stream.getReader();

      // 3. This subscribe request should be sent along to the SFU
      const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(true);

      // 4. Once the SFU has acknowledged the subscription, a handle is sent back representing
      // the subscription
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 5. Wait for the subscription to be fully established
      await sfuSubscriptionComplete;

      // 6. Simulate receiving a packet
      manager.packetReceived(
        new DataTrackPacket(
          new DataTrackPacketHeader({
            extensions: new DataTrackExtensions(),
            frameNumber: WrapAroundUnsignedInt.u16(0),
            marker: FrameMarker.Single,
            sequence: WrapAroundUnsignedInt.u16(0),
            timestamp: DataTrackTimestamp.fromRtpTicks(0),
            trackHandle: DataTrackHandle.fromNumber(5),
          }),
          new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]),
        ).toBinary(),
      );

      // 7. Make sure that packet comes out of the ReadableStream
      const { value, done } = await reader.read();
      expect(done).toStrictEqual(false);
      expect(value?.payload).toStrictEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]));
    });

    it('should test data track subscribing with end to end encryption (ok case)', async () => {
      const manager = new IncomingDataTrackManager({
        e2eeManager: new PrefixingEncryptionProvider(),
      });
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: true }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Create a subscription readable stream
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(sid);
      const reader = stream.getReader();

      // 3. This subscribe request should be sent along to the SFU
      const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(true);

      // 4. Once the SFU has acknowledged the subscription, a handle is sent back representing
      // the subscription
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 5. Wait for the subscription to be fully established
      await sfuSubscriptionComplete;

      // 6. Simulate receiving a (fake) encrypted packet
      manager.packetReceived(
        new DataTrackPacket(
          new DataTrackPacketHeader({
            extensions: new DataTrackExtensions({
              e2ee: new DataTrackE2eeExtension(0, new Uint8Array(12)),
            }),
            frameNumber: WrapAroundUnsignedInt.u16(0),
            marker: FrameMarker.Single,
            sequence: WrapAroundUnsignedInt.u16(0),
            timestamp: DataTrackTimestamp.fromRtpTicks(0),
            trackHandle: DataTrackHandle.fromNumber(5),
          }),
          new Uint8Array([
            // Fake encryption bytes prefix
            0xde, 0xad, 0xbe, 0xef,
            // Actual payload
            0x01, 0x02, 0x03, 0x04, 0x05,
          ]),
        ).toBinary(),
      );

      // 7. Make sure that packet comes out of the ReadableStream
      const { value, done } = await reader.read();
      expect(done).toStrictEqual(false);
      expect(value?.payload).toStrictEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]));
    });

    it('should fan out received events across multiple subscriptions', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';

      const handleAllocator = new DataTrackHandleAllocator();

      // 1. Make sure the data track publication is registered
      const pubHandle = handleAllocator.get()!;
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Set up lots of subscribers
      const readers: Array<ReadableStreamDefaultReader<DataTrackFrame>> = [];
      for (let index = 0; index < 8; index += 1) {
        // Create a subscription readable stream
        const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(sid);
        readers.push(stream.getReader());

        // Make sure that the sfu interactions ONLY happen for the first subscription opened.
        if (index === 0) {
          // This subscribe request should be sent along to the SFU
          const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
          expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
          expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(true);

          // Simulate the subscribe being acknowledged by the SFU
          manager.receivedSfuSubscriberHandles(
            new Map([[DataTrackHandle.fromNumber(1 /* publish handle */ + index), sid]]),
          );
        }

        // 5. Wait for the subscription to be fully established
        await sfuSubscriptionComplete;
      }

      // 6. Simulate receiving a packet
      manager.packetReceived(
        new DataTrackPacket(
          new DataTrackPacketHeader({
            extensions: new DataTrackExtensions(),
            frameNumber: WrapAroundUnsignedInt.u16(0),
            marker: FrameMarker.Single,
            sequence: WrapAroundUnsignedInt.u16(0),
            timestamp: DataTrackTimestamp.fromRtpTicks(0),
            trackHandle: pubHandle,
          }),
          new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]),
        ).toBinary(),
      );

      // 7. Make sure that packet comes out of all of the `ReadableStream`s
      const results = await Promise.all(readers.map((reader) => reader.read()));
      for (const { value, done } of results) {
        expect(done).toStrictEqual(false);
        expect(value?.payload).toStrictEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]));
      }
    });

    it('should be unable to subscribe to a non existing data track', async () => {
      const manager = new IncomingDataTrackManager();
      const [, subscriptionPromise] = manager.openSubscriptionStream('does not exist');
      await expect(subscriptionPromise).rejects.toThrowError('Cannot subscribe to unknown track');
    });

    it('should terminate the sfu subscription if the abortsignal is triggered on the only subscription', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const sid = 'data track sid';

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([
          [
            'identity',
            [{ sid, pubHandle: DataTrackHandle.fromNumber(5), name: 'test', usesE2ee: false }],
          ],
        ]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Subscribe to a data track
      const controller = new AbortController();
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(
        sid,
        controller.signal,
      );
      await managerEvents.waitFor('sfuUpdateSubscription');
      manager.receivedSfuSubscriberHandles(new Map([[DataTrackHandle.fromNumber(5), sid]]));

      // 3. Wait for the subscription to be fully established
      await sfuSubscriptionComplete;

      // 4. Start consuming the readable stream
      const reader = stream.getReader();
      const inFlightReadPromise = reader.read();

      // 5. Cancel the subscription
      controller.abort();
      await expect(inFlightReadPromise).rejects.toThrowError(
        'Subscription to data track cancelled by caller',
      );

      // 6. Make sure the underlying sfu subscription is also terminated, since nothing needs it
      // anymore.
      const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(false);

      // 7. Make sure shutting down the manager doesn't throw errors
      manager.shutdown();
    });

    it('should NOT terminate the sfu subscription if the abortsignal is triggered on one of two active subscriptions', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const sid = 'data track sid';

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([
          [
            'identity',
            [{ sid, pubHandle: DataTrackHandle.fromNumber(5), name: 'test', usesE2ee: false }],
          ],
        ]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Subscribe to a data track twice
      const controllerOne = new AbortController();
      const [streamOne, sfuSubscriptionOneComplete] = manager.openSubscriptionStream(
        sid,
        controllerOne.signal,
      );
      await managerEvents.waitFor('sfuUpdateSubscription'); // Subscription started
      manager.receivedSfuSubscriberHandles(new Map([[DataTrackHandle.fromNumber(5), sid]]));
      await sfuSubscriptionOneComplete;

      const controllerTwo = new AbortController();
      const [streamTwo, sfuSubscriptionTwoComplete] = manager.openSubscriptionStream(
        sid,
        controllerTwo.signal,
      );
      // NOTE: no new sfu subscription here, the first stream handled setting this up
      await sfuSubscriptionTwoComplete;

      // 3. Start consuming the both subscription's readable streams
      const readerOne = streamOne.getReader();
      const inFlightReadOnePromise = readerOne.read();

      const readerTwo = streamTwo.getReader();
      const inFlightReadTwoPromise = readerTwo.read();

      // 3. Cancel the first subscription, make sure JUST that subscription is cancelled
      controllerOne.abort();
      await expect(inFlightReadOnePromise).rejects.toThrowError(
        'Subscription to data track cancelled by caller',
      );

      // 4. Make sure the other subscription is still active / was untouched by the first stream
      // being aborted.
      await expect(
        Promise.race([inFlightReadTwoPromise, Promise.resolve('pending')]),
      ).resolves.toStrictEqual('pending');

      // 4. Make sure the underlying sfu subscription has not been also cancelled, there still is
      // one data track subscription active
      expect(managerEvents.areThereBufferedEvents('sfuUpdateSubscription')).toBe(false);
    });

    it('should terminate the sfu subscription if the abortsignal is already aborted', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
      ]);

      const sid = 'data track sid';

      // Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([
          [
            'identity',
            [{ sid, pubHandle: DataTrackHandle.fromNumber(5), name: 'test', usesE2ee: false }],
          ],
        ]),
      );

      // Subscribe to a data track
      const [, subscribeRequestPromise] = manager.openSubscriptionStream(
        sid,
        AbortSignal.abort(/* already aborted */),
      );
      const start = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(start.subscribe).toBe(true);

      // Make sure cancellation is immediately bubbled up
      await expect(subscribeRequestPromise).rejects.toStrictEqual(
        DataTrackSubscribeError.cancelled(),
      );

      // Make sure that there is immediately another "unsubscribe" sent
      const end = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(end.subscribe).toBe(false);
    });

    it('should terminate the sfu subscription once all listeners have unsubscribed', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const sid = 'data track sid';

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([
          [
            'identity',
            [{ sid, pubHandle: DataTrackHandle.fromNumber(5), name: 'test', usesE2ee: false }],
          ],
        ]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Create subscription A
      const controllerA = new AbortController();
      const [, subscribeAPromise] = manager.openSubscriptionStream(sid, controllerA.signal);
      const startEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(startEvent.sid).toStrictEqual(sid);
      expect(startEvent.subscribe).toStrictEqual(true);

      // 2. Create subscription B
      const controllerB = new AbortController();
      const [, subscribeBPromise] = manager.openSubscriptionStream(sid, controllerB.signal);
      expect(managerEvents.areThereBufferedEvents('sfuUpdateSubscription')).toStrictEqual(false);

      // 3. Cancel the subscription A
      controllerA.abort();
      expect(managerEvents.areThereBufferedEvents('sfuUpdateSubscription')).toStrictEqual(false);

      // 4. Cancel the subscription B, make sure the underlying sfu subscription is disposed
      controllerB.abort();
      const endEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(endEvent.sid).toStrictEqual(sid);
      expect(endEvent.subscribe).toStrictEqual(false);

      await expect(subscribeAPromise).rejects.toThrow();
      await expect(subscribeBPromise).rejects.toThrow();
    });

    it('should terminate PENDING sfu subscriptions if the participant disconnects', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Begin subscribing to a data track
      const [, subscriptionCompletePromise] = manager.openSubscriptionStream(sid);

      // 3. Simulate the remote participant disconnecting
      manager.handleRemoteParticipantDisconnected(senderIdentity);

      // 4. Make sure the pending subscribe was terminated
      await expect(subscriptionCompletePromise).rejects.toThrowError(
        'Cannot subscribe to data track when disconnected',
      );
    });

    it('should terminate ACTIVE sfu subscriptions if the participant disconnects', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Subscribe to a data track, and send the handle back as if the SFU acknowledged it
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(sid);
      const reader = stream.getReader();
      const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(true);
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 3. Start an active stream read for later
      await sfuSubscriptionComplete;

      // 4. Simulate the remote participant disconnecting
      manager.handleRemoteParticipantDisconnected(senderIdentity);

      // 5. Make sure the sfu unsubscribes
      const endEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(endEvent.sid).toStrictEqual(sid);
      expect(endEvent.subscribe).toStrictEqual(false);

      // 6. Make sure the in flight stream read was closed
      await reader.closed;
    });

    it('should terminate ACTIVE sfu subscriptions which have been aborted if the participant disconnects', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Subscribe to a data track, and send the handle back as if the SFU acknowledged it
      const controller = new AbortController();
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(
        sid,
        controller.signal,
      );
      const reader = stream.getReader();
      const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(true);
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 3. Start an in flight stream read
      await sfuSubscriptionComplete;
      const inFlightReadPromise = reader.read();

      // 4. Abort the abort controller, which should abort the in flight stream read
      controller.abort();
      await expect(inFlightReadPromise).rejects.toThrowError(
        'Subscription to data track cancelled by caller',
      );

      // 4. Simulate the remote participant disconnecting
      manager.handleRemoteParticipantDisconnected(senderIdentity);

      // 5. Make sure the sfu unsubscribes
      const endEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(endEvent.sid).toStrictEqual(sid);
      expect(endEvent.subscribe).toStrictEqual(false);
    });

    it('should terminate ACTIVE sfu subscriptions which have been aborted if the track is unpublished', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
        'trackUnpublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Subscribe to a data track, and send the handle back as if the SFU acknowledged it
      const controller = new AbortController();
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(
        sid,
        controller.signal,
      );
      const reader = stream.getReader();
      await managerEvents.waitFor('sfuUpdateSubscription');
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 3. Start an in flight stream read
      await sfuSubscriptionComplete;
      const inFlightReadPromise = reader.read();

      // 4. Abort the controller - this errors the stream's underlying controller
      controller.abort();
      await expect(inFlightReadPromise).rejects.toThrowError(
        'Subscription to data track cancelled by caller',
      );

      // 5. Unpublish the track - closeStreamControllers must tolerate the already-errored
      // controller (this used to crashing with "Cannot close an errored readable stream")
      await manager.receiveSfuPublicationUpdates(new Map([[senderIdentity, []]]));

      // 6. Make sure the trackUnpublished event fires
      const trackUnpublishedEvent = await managerEvents.waitFor('trackUnpublished');
      expect(trackUnpublishedEvent.sid).toStrictEqual(sid);
    });

    it('should not throw when shutting down with an aborted active subscription', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
        'trackUnpublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Subscribe to a data track, and send the handle back as if the SFU acknowledged it
      const controller = new AbortController();
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(
        sid,
        controller.signal,
      );
      await managerEvents.waitFor('sfuUpdateSubscription');
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));
      await sfuSubscriptionComplete;

      // 3. Abort the controller to error the stream's underlying controller
      const reader = stream.getReader();
      const inFlightReadPromise = reader.read();
      controller.abort();
      await expect(inFlightReadPromise).rejects.toThrowError(
        'Subscription to data track cancelled by caller',
      );

      // 4. Shutdown the manager, and make sure it doesn't throw
      manager.shutdown();

      // 5. Make sure the trackUnpublished event fires for the descriptor
      const trackUnpublishedEvent = await managerEvents.waitFor('trackUnpublished');
      expect(trackUnpublishedEvent.sid).toStrictEqual(sid);
    });

    it('should close the remaining active stream when one of two active subscriptions is aborted before disconnect', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Open two subscriptions with separate abort controllers
      const controllerA = new AbortController();
      const [streamA, sfuSubscriptionACompletePromise] = manager.openSubscriptionStream(
        sid,
        controllerA.signal,
      );
      await managerEvents.waitFor('sfuUpdateSubscription');
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));
      await sfuSubscriptionACompletePromise;

      const controllerB = new AbortController();
      const [streamB, sfuSubscriptionBCompletePromise] = manager.openSubscriptionStream(
        sid,
        controllerB.signal,
      );
      await sfuSubscriptionBCompletePromise;

      const readerA = streamA.getReader();
      const readerB = streamB.getReader();
      const inFlightReadAPromise = readerA.read();

      // 3. Abort only A - this errors A's controller
      controllerA.abort();
      await expect(inFlightReadAPromise).rejects.toThrowError(
        'Subscription to data track cancelled by caller',
      );

      // 4. Disconnect the participant. closeStreamControllers must gracefully close B
      // without crashing on A's errored controller (which should already have been removed
      // from the map by onAbort).
      manager.handleRemoteParticipantDisconnected(senderIdentity);

      // 5. B's reader closes cleanly
      await readerB.closed;

      // 6. Perform a single unsubscribe event - no double-unsubscribe from A's abort + disconnect
      const endEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(endEvent.sid).toStrictEqual(sid);
      expect(endEvent.subscribe).toStrictEqual(false);
      expect(managerEvents.areThereBufferedEvents('sfuUpdateSubscription')).toBe(false);
    });

    it('should error the stream if the descriptor is unpublished between subscribe resolve and post-subscribe setup', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
        'trackUnpublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Start subscribing - the .then handler on subscribeRequest is now pending
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(sid);
      const reader = stream.getReader();
      await managerEvents.waitFor('sfuUpdateSubscription');

      // 3. Acknowledge the SFU handle - this synchronously resolves the completionFuture
      // and flips the subscription state to 'active', but the .then microtask has not run yet
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 4. Synchronously unpublish the track before the .then microtask fires
      manager.handleTrackUnpublished(sid);

      // 5. When .then runs, the descriptor lookup returns undefined and the handler
      // must error the stream and reject sfuSubscriptionComplete (instead of hanging)
      await expect(sfuSubscriptionComplete).rejects.toStrictEqual(
        DataTrackSubscribeError.disconnected(),
      );
      await expect(reader.read()).rejects.toStrictEqual(DataTrackSubscribeError.disconnected());
    });

    it('should not throw or emit extra events when aborting after a manager-driven close', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Subscribe to a data track, and send the handle back as if the SFU acknowledged it
      const controller = new AbortController();
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(
        sid,
        controller.signal,
      );
      const reader = stream.getReader();
      await managerEvents.waitFor('sfuUpdateSubscription');
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));
      await sfuSubscriptionComplete;

      // 3. Manager-driven close via disconnect. detachSignal must have run so that the
      // user's AbortSignal no longer triggers onAbort.
      manager.handleRemoteParticipantDisconnected(senderIdentity);
      await reader.closed;

      // 4. Consume the unsubscribe event
      const endEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(endEvent.subscribe).toBe(false);

      // 5. Aborting after the manager has already closed the stream must be a no-op:
      // no throw, and no additional sfuUpdateSubscription events
      expect(() => controller.abort()).not.toThrow();
      expect(managerEvents.areThereBufferedEvents('sfuUpdateSubscription')).toBe(false);
    });

    it('should terminate the sfu subscription once all downstream ReadableStreams are cancelled', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackPublished',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackPublished');

      // 2. Create a subscription readable stream
      const [stream, sfuSubscriptionComplete] = manager.openSubscriptionStream(sid);
      const reader = stream.getReader();

      // 3. This subscribe request should be sent along to the SFU
      const sfuUpdateSubscriptionInitEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionInitEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionInitEvent.subscribe).toStrictEqual(true);

      // 4. Once the SFU has acknowledged the subscription, a handle is sent back representing
      // the subscription
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 5. Wait for the subscription to be fully established
      await sfuSubscriptionComplete;

      // 6. Manually cancel the readable stream
      await reader.cancel();

      // 7. Make sure the underlying SFU subscription is terminated
      const sfuUpdateSubscriptionCancelEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionCancelEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionCancelEvent.subscribe).toStrictEqual(false);

      // 8. Make sure the in flight stream is now complete
      await expect(reader.read()).resolves.toStrictEqual({ value: undefined, done: true });
    });
  });
});
