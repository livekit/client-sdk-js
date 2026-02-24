/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { DataTrackFrame } from '../frame';
import { DataTrackHandle, DataTrackHandleAllocator } from '../handle';
import { DataTrackPacket, DataTrackPacketHeader, FrameMarker } from '../packet';
import { DataTrackE2eeExtension, DataTrackExtensions } from '../packet/extensions';
import { DataTrackTimestamp, WrapAroundUnsignedInt } from '../utils';
import IncomingDataTrackManager, {
  DataTrackIncomingManagerCallbacks,
} from './IncomingDataTrackManager';
import { DataTrackSubscribeError } from './errors';
import { PrefixingEncryptionProvider } from '../outgoing/OutgoingDataTrackManager.test';

describe('DataTrackIncomingManager', () => {
  describe('Track publication', () => {
    it('should test track publication additions / removals', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackAvailable',
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

      const trackAvailableEvent = await managerEvents.waitFor('trackAvailable');
      expect(trackAvailableEvent.track.info.sid).toStrictEqual('sid1');
      expect(trackAvailableEvent.track.info.pubHandle).toStrictEqual(DataTrackHandle.fromNumber(5));
      expect(trackAvailableEvent.track.info.name).toStrictEqual('test');
      expect(trackAvailableEvent.track.info.usesE2ee).toStrictEqual(false);

      // 2. Check to make sure the publication has been noted in internal state
      expect((await manager.queryPublications()).map((p) => p.pubHandle)).to.deep.equal([
        DataTrackHandle.fromNumber(5),
      ]);

      // 3. Remove all tracks, and make sure the internal state is cleared
      await manager.receiveSfuPublicationUpdates(new Map([['identity1', []]]));
      expect(await manager.queryPublications()).to.deep.equal([]);
    });
  });

  describe('Track subscription', () => {
    it('should test data track subscribing (ok case)', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackAvailable',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackAvailable');

      // 2. Subscribe to a data track
      const subscribeRequestPromise = manager.subscribeRequest(sid);

      // 3. This subscribe request should be sent along to the SFU
      const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(true);

      // 4. Once the SFU has acknowledged the subscription, a handle is sent back representing
      // the subscription
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 5. Make sure that the subscription promise resolves.
      const readableStream = await subscribeRequestPromise;
      const reader = readableStream.getReader();

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
        'trackAvailable',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: true }]]]),
      );
      await managerEvents.waitFor('trackAvailable');

      // 2. Subscribe to a data track
      const subscribeRequestPromise = manager.subscribeRequest(sid);

      // 3. This subscribe request should be sent along to the SFU
      const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(true);

      // 4. Once the SFU has acknowledged the subscription, a handle is sent back representing
      // the subscription
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 5. Make sure that the subscription promise resolves.
      const readableStream = await subscribeRequestPromise;
      const reader = readableStream.getReader();

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
        'trackAvailable',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';

      const handleAllocator = new DataTrackHandleAllocator();

      // 1. Make sure the data track publication is registered
      const pubHandle = handleAllocator.get()!;
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackAvailable');

      // 2. Set up lots of subscribers
      const readers: Array<ReadableStreamDefaultReader<DataTrackFrame>> = [];
      for (let index = 0; index < 8; index += 1) {
        // Subscribe to a data track
        const subscribeRequestPromise = manager.subscribeRequest(sid);

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

        // 5. Make sure that the subscription promise resolves.
        const readableStream = await subscribeRequestPromise;
        const reader = readableStream.getReader();
        readers.push(reader);
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
      await expect(manager.subscribeRequest('does not exist')).rejects.toThrowError(
        'Cannot subscribe to data track when disconnected',
      );
    });

    it('should terminate the sfu subscription if the abortsignal is triggered on the only subscription', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackAvailable',
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
      await managerEvents.waitFor('trackAvailable');

      // 2. Subscribe to a data track
      const controller = new AbortController();
      const subscribeRequestPromise = manager.subscribeRequest(sid, controller.signal);
      await managerEvents.waitFor('sfuUpdateSubscription');

      // 3. Cancel the subscription
      controller.abort();
      await expect(subscribeRequestPromise).rejects.toThrowError(
        'Subscription to data track cancelled by caller',
      );

      // 4. Make sure the underlying sfu subscription is also terminated, since nothing needs it
      // anymore.
      const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(false);
    });

    it('should NOT terminate the sfu subscription if the abortsignal is triggered on one of two active subscriptions', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackAvailable',
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
      await managerEvents.waitFor('trackAvailable');

      // 2. Subscribe to a data track twice
      const controllerOne = new AbortController();
      const subscribeRequestOnePromise = manager.subscribeRequest(sid, controllerOne.signal);
      await managerEvents.waitFor('sfuUpdateSubscription'); // Subscription started

      const controllerTwo = new AbortController();
      manager.subscribeRequest(sid, controllerTwo.signal);

      // 3. Cancel the first subscription
      controllerOne.abort();
      await expect(subscribeRequestOnePromise).rejects.toThrowError(
        'Subscription to data track cancelled by caller',
      );

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
      const subscribeRequestPromise = manager.subscribeRequest(
        sid,
        AbortSignal.abort(/* already aborted */),
      );
      const start = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(start.subscribe).toBe(true);

      // Make sure cancellation is immediately bubbled up
      expect(subscribeRequestPromise).rejects.toStrictEqual(DataTrackSubscribeError.cancelled());

      // Make sure that there is immediately another "unsubscribe" sent
      const end = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(end.subscribe).toBe(false);
    });

    it('should terminate the sfu subscription once all listeners have unsubscribed', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackAvailable',
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
      await managerEvents.waitFor('trackAvailable');

      // 2. Create subscription A
      const controllerA = new AbortController();
      const subscribeAPromise = manager.subscribeRequest(sid, controllerA.signal);
      const startEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(startEvent.sid).toStrictEqual(sid);
      expect(startEvent.subscribe).toStrictEqual(true);

      // 2. Create subscription B
      const controllerB = new AbortController();
      const subscribeBPromise = manager.subscribeRequest(sid, controllerB.signal);
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
        'trackAvailable',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackAvailable');

      // 2. Begin subscribing to a data track
      const promise = manager.subscribeRequest(sid);

      // 3. Simulate the remote participant disconnecting
      manager.handleRemoteParticipantDisconnected(senderIdentity);

      // 4. Make sure the pending subscribe was terminated
      await expect(promise).rejects.toThrowError(
        'Cannot subscribe to data track when disconnected',
      );
    });

    it('should terminate ACTIVE sfu subscriptions if the participant disconnects', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackAvailable',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackAvailable');

      // 2. Subscribe to a data track, and send the handle back as if the SFU acknowledged it
      const subscribeRequestPromise = manager.subscribeRequest(sid);
      const sfuUpdateSubscriptionEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionEvent.subscribe).toStrictEqual(true);
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 3. Start an active stream read for later
      const reader = (await subscribeRequestPromise).getReader();

      // 4. Simulate the remote participant disconnecting
      manager.handleRemoteParticipantDisconnected(senderIdentity);

      // 5. Make sure the sfu unsubscribes
      const endEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(endEvent.sid).toStrictEqual(sid);
      expect(endEvent.subscribe).toStrictEqual(false);

      // 6. Make sure the in flight stream read was closed
      await reader.closed;
    });

    it('should terminate the sfu subscription once all downstream ReadableStreams are cancelled', async () => {
      const manager = new IncomingDataTrackManager();
      const managerEvents = subscribeToEvents<DataTrackIncomingManagerCallbacks>(manager, [
        'sfuUpdateSubscription',
        'trackAvailable',
      ]);

      const senderIdentity = 'identity';
      const sid = 'data track sid';
      const handle = DataTrackHandle.fromNumber(5);

      // 1. Make sure the data track publication is registered
      await manager.receiveSfuPublicationUpdates(
        new Map([[senderIdentity, [{ sid, pubHandle: handle, name: 'test', usesE2ee: false }]]]),
      );
      await managerEvents.waitFor('trackAvailable');

      // 2. Subscribe to a data track
      const subscribeRequestPromise = manager.subscribeRequest(sid);

      // 3. This subscribe request should be sent along to the SFU
      const sfuUpdateSubscriptionInitEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionInitEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionInitEvent.subscribe).toStrictEqual(true);

      // 4. Once the SFU has acknowledged the subscription, a handle is sent back representing
      // the subscription
      manager.receivedSfuSubscriberHandles(new Map([[handle, sid]]));

      // 5. Make sure that the subscription promise resolves.
      const readableStream = await subscribeRequestPromise;
      const reader = readableStream.getReader();

      // 6. Manually cancel the readable stream
      await reader.cancel();

      // 7. Make sure the underlying SFU subscription is terminated
      const sfuUpdateSubscriptionCancelEvent = await managerEvents.waitFor('sfuUpdateSubscription');
      expect(sfuUpdateSubscriptionCancelEvent.sid).toStrictEqual(sid);
      expect(sfuUpdateSubscriptionCancelEvent.subscribe).toStrictEqual(false);
    });
  });
});
