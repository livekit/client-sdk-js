/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type DecryptDataResponseMessage,
  type EncryptDataResponseMessage,
  LocalDataTrack,
} from '../../..';
import { type BaseE2EEManager } from '../../../e2ee/E2eeManager';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import RTCEngine from '../../RTCEngine';
import Room from '../../Room';
import { DataTrackHandle } from '../handle';
import { DataTrackPacket, FrameMarker } from '../packet';
import OutgoingDataTrackManager, {
  type DataTrackOutgoingManagerCallbacks,
  Descriptor,
} from './OutgoingDataTrackManager';
import { DataTrackPublishError } from './errors';

/** Fake encryption provider for testing e2ee data track features. */
export class PrefixingEncryptionProvider implements BaseE2EEManager {
  isEnabled = true;

  isDataChannelEncryptionEnabled = true;

  setup(_room: Room) {}

  setupEngine(_engine: RTCEngine) {}

  setParticipantCryptorEnabled(_enabled: boolean, _participantIdentity: string) {}

  setSifTrailer(_trailer: Uint8Array) {}

  on(_event: any, _listener: any): this {
    return this;
  }

  /** A fake "encryption" provider used for test purposes. Adds a prefix to the payload. */
  async encryptData(data: Uint8Array): Promise<EncryptDataResponseMessage['data']> {
    const prefix = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

    const output = new Uint8Array(prefix.length + data.length);
    output.set(prefix, 0);
    output.set(data, prefix.length);

    return {
      uuid: crypto.randomUUID(),
      payload: output,
      iv: new Uint8Array(12), // Just leaving this empty, is this a bad idea?
      keyIndex: 0,
    };
  }

  /** A fake "decryption" provider used for test purposes. Assumes the payload is prefixed with
   * 0xdeafbeef, which is stripped off. */
  async handleEncryptedData(
    payload: Uint8Array,
    _iv: Uint8Array,
    _participantIdentity: string,
    _keyIndex: number,
  ): Promise<DecryptDataResponseMessage['data']> {
    if (payload[0] !== 0xde || payload[1] !== 0xad || payload[2] !== 0xbe || payload[3] !== 0xef) {
      throw new Error(
        `PrefixingEncryptionProvider: first four bytes of payload were not 0xdeadbeef, found ${payload.slice(0, 4)}`,
      );
    }

    return {
      uuid: crypto.randomUUID(),
      payload: payload.slice(4),
    };
  }
}

describe('DataTrackOutgoingManager', () => {
  it('should test track publishing (ok case)', async () => {
    const manager = new OutgoingDataTrackManager();
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
    ]);

    const localDataTrack = new LocalDataTrack({ name: 'test' }, manager);
    expect(localDataTrack.isPublished()).toStrictEqual(false);

    // 1. Publish a data track
    const publishRequestPromise = localDataTrack.publish();

    // 2. This publish request should be sent along to the SFU
    const sfuPublishEvent = await managerEvents.waitFor('sfuPublishRequest');
    expect(sfuPublishEvent.name).toStrictEqual('test');
    expect(sfuPublishEvent.usesE2ee).toStrictEqual(false);
    const handle = sfuPublishEvent.handle;

    // 3. Respond to the SFU publish request with an OK response
    manager.receivedSfuPublishResponse(handle, {
      type: 'ok',
      data: {
        sid: 'bogus-sid',
        pubHandle: sfuPublishEvent.handle,
        name: 'test',
        usesE2ee: false,
      },
    });

    // Make sure that the original input event resolves.
    await publishRequestPromise;
    expect(localDataTrack.isPublished()).toStrictEqual(true);
  });

  it('should test track publishing (error case)', async () => {
    const manager = new OutgoingDataTrackManager();
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
    ]);

    // 1. Publish a data track
    const localDataTrack = new LocalDataTrack({ name: 'test' }, manager);
    const publishRequestPromise = localDataTrack.publish();

    // 2. This publish request should be sent along to the SFU
    const sfuPublishEvent = await managerEvents.waitFor('sfuPublishRequest');

    // 3. Respond to the SFU publish request with an ERROR response
    manager.receivedSfuPublishResponse(sfuPublishEvent.handle, {
      type: 'error',
      error: DataTrackPublishError.limitReached(),
    });

    // Make sure that the rejection bubbles back to the caller
    await expect(publishRequestPromise).rejects.toThrowError(
      'Data track publication limit reached',
    );
  });

  it('should test track publishing (cancellation half way through)', async () => {
    const manager = new OutgoingDataTrackManager();
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
      'sfuUnpublishRequest',
    ]);

    // 1. Publish a data track
    const controller = new AbortController();
    const localDataTrack = new LocalDataTrack({ name: 'test' }, manager);
    const publishRequestPromise = localDataTrack.publish(controller.signal);

    // 2. This publish request should be sent along to the SFU
    const sfuPublishEvent = await managerEvents.waitFor('sfuPublishRequest');
    expect(sfuPublishEvent.name).toStrictEqual('test');
    expect(sfuPublishEvent.usesE2ee).toStrictEqual(false);
    const handle = sfuPublishEvent.handle;

    // 3. Explictly cancel the publish
    controller.abort();

    // 4. Make sure an unpublish event is sent so that the SFU cleans up things properly
    // on its end as well
    const sfuUnpublishEvent = await managerEvents.waitFor('sfuUnpublishRequest');
    expect(sfuUnpublishEvent.handle).toStrictEqual(handle);

    // 5. Make sure cancellation is bubbled up as an error to stop further execution
    await expect(publishRequestPromise).rejects.toStrictEqual(DataTrackPublishError.cancelled());
  });

  it('should test track publishing (cancellation before it starts)', async () => {
    const manager = new OutgoingDataTrackManager();
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
      'sfuUnpublishRequest',
    ]);

    // Publish a data track
    const localDataTrack = new LocalDataTrack({ name: 'test' }, manager);
    const publishRequestPromise = localDataTrack.publish(AbortSignal.abort(/* already aborted */));

    // Make sure cancellation is immediately bubbled up
    await expect(publishRequestPromise).rejects.toStrictEqual(DataTrackPublishError.cancelled());

    // And there were no pending sfu publish requests sent
    expect(managerEvents.areThereBufferedEvents('sfuPublishRequest')).toBe(false);
  });

  it('should test track publishing, unpublishing, and republishing again', async () => {
    const manager = new OutgoingDataTrackManager();
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
      'sfuUnpublishRequest',
    ]);

    // 1. Create a local data track
    const localDataTrack = new LocalDataTrack({ name: 'test' }, manager);
    expect(localDataTrack.isPublished()).toStrictEqual(false);

    // 2. Publish it
    const publishRequestPromise = localDataTrack.publish();

    // 3. This publish request should be sent along to the SFU
    const sfuPublishEvent = await managerEvents.waitFor('sfuPublishRequest');
    expect(sfuPublishEvent.name).toStrictEqual('test');
    expect(sfuPublishEvent.usesE2ee).toStrictEqual(false);
    const handle = sfuPublishEvent.handle;

    // 4. Respond to the SFU publish request with an OK response
    manager.receivedSfuPublishResponse(handle, {
      type: 'ok',
      data: {
        sid: 'bogus-sid',
        pubHandle: sfuPublishEvent.handle,
        name: 'test',
        usesE2ee: false,
      },
    });

    // Make sure that the original input event resolves.
    await publishRequestPromise;

    // 5. Now the data track should be published
    expect(localDataTrack.isPublished()).toStrictEqual(true);

    // 6. Unpublish the data track
    const unpublishRequestPromise = localDataTrack.unpublish();
    const sfuUnpublishEvent = await managerEvents.waitFor('sfuUnpublishRequest');
    manager.receivedSfuUnpublishResponse(sfuUnpublishEvent.handle);
    await unpublishRequestPromise;

    // 7. Now the data track should be unpublished
    expect(localDataTrack.isPublished()).toStrictEqual(false);

    // 8. Now, republish the track and make sure that be done a second time
    const publishRequestPromise2 = localDataTrack.publish();
    const sfuPublishEvent2 = await managerEvents.waitFor('sfuPublishRequest');
    expect(sfuPublishEvent2.name).toStrictEqual('test');
    expect(sfuPublishEvent2.usesE2ee).toStrictEqual(false);
    const handle2 = sfuPublishEvent2.handle;
    manager.receivedSfuPublishResponse(handle2, {
      type: 'ok',
      data: {
        sid: 'bogus-sid',
        pubHandle: sfuPublishEvent2.handle,
        name: 'test',
        usesE2ee: false,
      },
    });
    await publishRequestPromise2;

    // 9. Ensure that the track is published again
    expect(localDataTrack.isPublished()).toStrictEqual(true);

    // 10. Also ensure that the handle used on the second publish attempt differs from the first
    // publish attempt.
    expect(handle).not.toStrictEqual(handle2);
  });

  it.each([
    // Single packet payload case
    [
      new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]),
      [
        {
          header: {
            extensions: {
              e2ee: null,
              userTimestamp: null,
            },
            frameNumber: 0,
            marker: FrameMarker.Single,
            sequence: 0,
            timestamp: expect.anything(),
            trackHandle: 5,
          },
          payload: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]),
        },
      ],
    ],

    // Multi packet payload case
    [
      new Uint8Array(24_000).fill(0xbe),
      [
        {
          header: {
            extensions: {
              e2ee: null,
              userTimestamp: null,
            },
            frameNumber: 0,
            marker: FrameMarker.Start,
            sequence: 0,
            timestamp: expect.anything(),
            trackHandle: 5,
          },
          payload: new Uint8Array(15988 /* 16k mtu - 12 header bytes */).fill(0xbe),
        },
        {
          header: {
            extensions: {
              e2ee: null,
              userTimestamp: null,
            },
            frameNumber: 0,
            marker: FrameMarker.Final,
            sequence: 1,
            timestamp: expect.anything(),
            trackHandle: 5,
          },
          payload: new Uint8Array(8012 /* 24k payload - (16k mtu - 12 header bytes) */).fill(0xbe),
        },
      ],
    ],
  ])(
    'should test track payload sending',
    async (inputBytes: Uint8Array, outputPacketsJson: Array<unknown>) => {
      // Create a manager prefilled with a descriptor
      const manager = OutgoingDataTrackManager.withDescriptors(
        new Map([
          [
            DataTrackHandle.fromNumber(5),
            Descriptor.active(
              {
                sid: 'bogus-sid',
                pubHandle: 5,
                name: 'test',
                usesE2ee: false,
              },
              null,
            ),
          ],
        ]),
      );
      const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
        'packetAvailable',
      ]);

      const localDataTrack = LocalDataTrack.withExplicitHandle({ name: 'track name' }, manager, 5);

      // Kick off sending the bytes...
      localDataTrack.tryPush({ payload: inputBytes });

      // ... and make sure the corresponding events are emitted to tell the SFU to send the packets
      for (const outputPacketJson of outputPacketsJson) {
        const packetBytes = await managerEvents.waitFor('packetAvailable');
        const [packet] = DataTrackPacket.fromBinary(packetBytes.bytes);

        expect(packet.toJSON()).toStrictEqual(outputPacketJson);
      }
    },
  );

  it('should send e2ee encrypted datatrack payload', async () => {
    const manager = new OutgoingDataTrackManager({
      e2eeManager: new PrefixingEncryptionProvider(),
    });
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
      'packetAvailable',
    ]);

    // 1. Publish a data track
    const localDataTrack = new LocalDataTrack({ name: 'test' }, manager);
    const publishRequestPromise = localDataTrack.publish();

    // 2. This publish request should be sent along to the SFU
    const sfuPublishEvent = await managerEvents.waitFor('sfuPublishRequest');
    expect(sfuPublishEvent.name).toStrictEqual('test');
    expect(sfuPublishEvent.usesE2ee).toStrictEqual(true); // NOTE: this is true, e2ee is enabled!
    const handle = sfuPublishEvent.handle;

    // 3. Respond to the SFU publish request with an OK response
    manager.receivedSfuPublishResponse(handle, {
      type: 'ok',
      data: {
        sid: 'bogus-sid',
        pubHandle: sfuPublishEvent.handle,
        name: 'test',
        usesE2ee: true, // NOTE: this is true, e2ee is enabled!
      },
    });

    // Get the connected local data track
    await publishRequestPromise;
    expect(localDataTrack.isPublished()).toStrictEqual(true);

    // Kick off sending the payload bytes
    localDataTrack.tryPush({ payload: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]) });

    // Make sure the packet that was sent was encrypted with the PrefixingEncryptionProvider
    const packetBytes = await managerEvents.waitFor('packetAvailable');
    const [packet] = DataTrackPacket.fromBinary(packetBytes.bytes);

    expect(packet.toJSON()).toStrictEqual({
      header: {
        extensions: {
          e2ee: {
            iv: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            keyIndex: 0,
            lengthBytes: 13,
            tag: 1,
          },
          userTimestamp: null,
        },
        frameNumber: 0,
        marker: 3,
        sequence: 0,
        timestamp: expect.anything(),
        trackHandle: 1,
      },
      payload: new Uint8Array([
        // Encryption added prefix
        0xde, 0xad, 0xbe, 0xef,
        // Actual payload
        0x01, 0x02, 0x03, 0x04, 0x05,
      ]),
    });
  });

  it('should test track unpublishing', async () => {
    // Create a manager prefilled with a descriptor
    const manager = OutgoingDataTrackManager.withDescriptors(
      new Map([
        [
          DataTrackHandle.fromNumber(5),
          Descriptor.active(
            {
              sid: 'bogus-sid',
              pubHandle: 5,
              name: 'test',
              usesE2ee: false,
            },
            null,
          ),
        ],
      ]),
    );
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuUnpublishRequest',
    ]);

    // Make sure the descriptor is in there
    expect(manager.getDescriptor(5)?.type).toStrictEqual('active');

    // Unpublish data track
    const unpublishRequestPromise = manager.unpublishRequest(DataTrackHandle.fromNumber(5));

    const sfuUnpublishEvent = await managerEvents.waitFor('sfuUnpublishRequest');
    expect(sfuUnpublishEvent.handle).toStrictEqual(5);

    manager.receivedSfuUnpublishResponse(DataTrackHandle.fromNumber(5));

    await unpublishRequestPromise;

    // Make sure data track is no longer
    expect(manager.getDescriptor(5)).toStrictEqual(null);
  });

  it('should test a full reconnect', async () => {
    const pubHandle = 5;
    // Create a manager prefilled with a descriptor
    const manager = OutgoingDataTrackManager.withDescriptors(
      new Map([
        [
          DataTrackHandle.fromNumber(5),
          Descriptor.active(
            {
              sid: 'bogus-sid',
              pubHandle,
              name: 'test',
              usesE2ee: false,
            },
            null,
          ),
        ],
      ]),
    );
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
      'packetAvailable',
      'sfuUnpublishRequest',
    ]);
    const localDataTrack = LocalDataTrack.withExplicitHandle({ name: 'track name' }, manager, 5);

    // Make sure the descriptor is in there
    expect(manager.getDescriptor(5)?.type).toStrictEqual('active');

    // Simulate a full reconnect, which means that any published tracks will need to be republished.
    manager.sfuWillRepublishTracks();

    // Even though behind the scenes the SFU publications are not active, the user should still see
    // it as "published", sfu reconnects are an implementation detail
    expect(localDataTrack.isPublished()).toStrictEqual(true);

    // But, even though `isPublished` is true, pushing data should drop (no sfu to send them to!)
    await expect(() =>
      localDataTrack.tryPush({ payload: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]) }),
    ).rejects.toThrowError('Frame was dropped');

    // 2. This publish request should be sent along to the SFU
    const sfuPublishEvent = await managerEvents.waitFor('sfuPublishRequest');
    expect(sfuPublishEvent.name).toStrictEqual('test');
    expect(sfuPublishEvent.usesE2ee).toStrictEqual(false);
    const handle = sfuPublishEvent.handle;
    expect(handle).toStrictEqual(pubHandle);

    // 3. Respond to the SFU publish request with an OK response
    manager.receivedSfuPublishResponse(handle, {
      type: 'ok',
      data: {
        sid: 'bogus-sid-REPUBLISHED',
        pubHandle: sfuPublishEvent.handle,
        name: 'test',
        usesE2ee: false,
      },
    });

    // After all this, the local data track should still be published
    expect(localDataTrack.isPublished()).toStrictEqual(true);

    // And the sid should be the new value
    expect(localDataTrack.info!.sid).toStrictEqual('bogus-sid-REPUBLISHED');

    // And now that the tracks are backed by the SFU again, pushes should function!
    await localDataTrack.tryPush({ payload: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]) });
    await managerEvents.waitFor('packetAvailable');
  });

  it('should query currently active descriptors', async () => {
    // Create a manager prefilled with a descriptor
    const manager = OutgoingDataTrackManager.withDescriptors(
      new Map([
        [
          DataTrackHandle.fromNumber(2),
          Descriptor.active(
            {
              sid: 'bogus-sid-2',
              pubHandle: 2,
              name: 'twotwotwo',
              usesE2ee: false,
            },
            null,
          ),
        ],
        [
          DataTrackHandle.fromNumber(6),
          Descriptor.active(
            {
              sid: 'bogus-sid-6',
              pubHandle: 6,
              name: 'sixsixsix',
              usesE2ee: false,
            },
            null,
          ),
        ],
      ]),
    );

    const result = await manager.queryPublished();

    expect(result).toStrictEqual([
      { sid: 'bogus-sid-2', pubHandle: 2, name: 'twotwotwo', usesE2ee: false },
      { sid: 'bogus-sid-6', pubHandle: 6, name: 'sixsixsix', usesE2ee: false },
    ]);
  });

  it('should shutdown cleanly', async () => {
    // Create a manager prefilled with a descriptor
    const pendingDescriptor = Descriptor.pending();
    const manager = OutgoingDataTrackManager.withDescriptors(
      new Map<DataTrackHandle, Descriptor>([
        [DataTrackHandle.fromNumber(2), pendingDescriptor],
        [
          DataTrackHandle.fromNumber(6),
          Descriptor.active(
            {
              sid: 'bogus-sid-6',
              pubHandle: 6,
              name: 'sixsixsix',
              usesE2ee: false,
            },
            null,
          ),
        ],
      ]),
    );
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuUnpublishRequest',
    ]);

    // Shut down the manager
    const shutdownPromise = manager.reset();

    // The pending data track should be cancelled
    await expect(pendingDescriptor.completionFuture.promise).rejects.toThrowError(
      'Room disconnected',
    );

    // And the active data track should be requested to be unpublished
    const unpublishEvent = await managerEvents.waitFor('sfuUnpublishRequest');
    expect(unpublishEvent.handle).toStrictEqual(6);

    // Acknowledge that the unpublish has occurred
    manager.receivedSfuUnpublishResponse(DataTrackHandle.fromNumber(6));

    await shutdownPromise;
  });

  describe('localDataTrack.flush()', () => {
    it('should resolve flush() after a single tryPush once the packet is acknowledged', async () => {
      const pubHandle = 5;
      const manager = OutgoingDataTrackManager.withDescriptors(
        new Map([
          [
            DataTrackHandle.fromNumber(pubHandle),
            Descriptor.active(
              {
                sid: 'bogus-sid',
                pubHandle,
                name: 'test',
                usesE2ee: false,
              },
              null,
            ),
          ],
        ]),
      );
      const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
        'packetAvailable',
        'packetsFlushedChange',
      ]);
      const localDataTrack = LocalDataTrack.withExplicitHandle(
        { name: 'track name' },
        manager,
        pubHandle,
      );

      // 1. Push a single-packet payload
      await localDataTrack.tryPush({ payload: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]) });

      // 2. The packet should have been emitted to be sent over the data channel
      const packetEvent = await managerEvents.waitFor('packetAvailable');
      expect(packetEvent.handle).toStrictEqual(pubHandle);

      // 3. A event should be sent indicating that the data track is no longer "flushed"
      const noLongerFlushedEvent = await managerEvents.waitFor('packetsFlushedChange');
      expect(noLongerFlushedEvent.handle).toStrictEqual(pubHandle);
      expect(noLongerFlushedEvent.isFlushed).toStrictEqual(false);

      // 3. Calling flush() right after tryPush() should not resolve until the packet
      // is acknowledged via handlePacketSendComplete
      let flushed = false;
      const flushPromise = localDataTrack.flush().then(() => {
        flushed = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(flushed).toStrictEqual(false);
      expect(managerEvents.areThereBufferedEvents('packetsFlushedChange')).toBe(false);

      // 4. Acknowledge that the packet has been sent over the data channel
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));

      // 5. The packetsFlushed event fires once the in-flight packet counter reaches 0
      const flushedEvent = await managerEvents.waitFor('packetsFlushedChange');
      expect(flushedEvent.handle).toStrictEqual(pubHandle);
      expect(flushedEvent.isFlushed).toStrictEqual(true);

      // 6. The flush() promise resolves
      await flushPromise;
      expect(flushed).toStrictEqual(true);
    });

    it('should resolve flush() only after all packets in a multi-packet payload are acknowledged', async () => {
      const pubHandle = 5;
      const manager = OutgoingDataTrackManager.withDescriptors(
        new Map([
          [
            DataTrackHandle.fromNumber(pubHandle),
            Descriptor.active(
              {
                sid: 'bogus-sid',
                pubHandle,
                name: 'test',
                usesE2ee: false,
              },
              null,
            ),
          ],
        ]),
      );
      const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
        'packetAvailable',
        'packetsFlushedChange',
      ]);
      const localDataTrack = LocalDataTrack.withExplicitHandle(
        { name: 'track name' },
        manager,
        pubHandle,
      );

      // 1. Push a payload large enough to span multiple packets (24k > single packet mtu)
      await localDataTrack.tryPush({ payload: new Uint8Array(24_000).fill(0xbe) });

      // 2. A event should be sent indicating that the data track is no longer "flushed"
      const noLongerFlushedEvent = await managerEvents.waitFor('packetsFlushedChange');
      expect(noLongerFlushedEvent.handle).toStrictEqual(pubHandle);
      expect(noLongerFlushedEvent.isFlushed).toStrictEqual(false);

      // 3. Two packetAvailable events should be emitted for this payload
      await managerEvents.waitFor('packetAvailable');
      await managerEvents.waitFor('packetAvailable');

      // 4. Call flush() before any of the packets have been acknowledged
      let flushed = false;
      const flushPromise = localDataTrack.flush().then(() => {
        flushed = true;
      });

      // 5. Acknowledge the first packet -- flush should not resolve yet, in-flight counter still > 0
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(flushed).toStrictEqual(false);
      expect(managerEvents.areThereBufferedEvents('packetsFlushedChange')).toBe(false);

      // 6. Acknowledge the second packet -- flush resolves once the counter reaches 0
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));

      const flushedEvent = await managerEvents.waitFor('packetsFlushedChange');
      expect(flushedEvent.handle).toStrictEqual(pubHandle);
      expect(flushedEvent.isFlushed).toStrictEqual(true);

      await flushPromise;
      expect(flushed).toStrictEqual(true);
    });

    it('should resolve any pending flush() calls when the manager is reset', async () => {
      const pubHandle = 5;
      const manager = OutgoingDataTrackManager.withDescriptors(
        new Map([
          [
            DataTrackHandle.fromNumber(pubHandle),
            Descriptor.active(
              {
                sid: 'bogus-sid',
                pubHandle,
                name: 'test',
                usesE2ee: false,
              },
              null,
            ),
          ],
        ]),
      );
      const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
        'packetAvailable',
        'packetsFlushedChange',
        'reset',
      ]);
      const localDataTrack = LocalDataTrack.withExplicitHandle(
        { name: 'track name' },
        manager,
        pubHandle,
      );

      // 1. Push a single-packet payload
      await localDataTrack.tryPush({ payload: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]) });

      // 2. A event should be sent indicating that the data track is no longer "flushed"
      const noLongerFlushedEvent = await managerEvents.waitFor('packetsFlushedChange');
      expect(noLongerFlushedEvent.handle).toStrictEqual(pubHandle);
      expect(noLongerFlushedEvent.isFlushed).toStrictEqual(false);

      await managerEvents.waitFor('packetAvailable');

      // 3. Call flush() before the in-flight packet is acknowledged -- it should remain
      // pending because the in-flight counter is still > 0
      let flushed = false;
      const flushPromise = localDataTrack.flush().then(() => {
        flushed = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(flushed).toStrictEqual(false);
      expect(managerEvents.areThereBufferedEvents('packetsFlushedChange')).toBe(false);

      // 4. Reset the manager. This simulates a RTCEngine disconnect and should resolve
      // the pending flush() even though the packet was never acknowledged.
      await manager.reset();
      await managerEvents.waitFor('reset');

      // 5. The flush() promise resolves
      await flushPromise;
      expect(flushed).toStrictEqual(true);

      // 6. No packetsFlushed event was emitted -- reset short-circuits the flush directly
      // on the LocalDataTrack rather than going through the in-flight counter.
      expect(managerEvents.areThereBufferedEvents('packetsFlushedChange')).toBe(false);
    });

    it('should resolve flush() at the end of a batch of tryPush calls after all packets are later acknowledged as "sent"', async () => {
      const pubHandle = 5;
      const manager = OutgoingDataTrackManager.withDescriptors(
        new Map([
          [
            DataTrackHandle.fromNumber(pubHandle),
            Descriptor.active(
              {
                sid: 'bogus-sid',
                pubHandle,
                name: 'test',
                usesE2ee: false,
              },
              null,
            ),
          ],
        ]),
      );
      const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
        'packetAvailable',
        'packetsFlushedChange',
      ]);
      const localDataTrack = LocalDataTrack.withExplicitHandle(
        { name: 'track name' },
        manager,
        pubHandle,
      );

      // 1. Run a batch of tryPush calls
      await localDataTrack.tryPush({ payload: new Uint8Array([0x01]) });
      await localDataTrack.tryPush({ payload: new Uint8Array([0x02]) });
      await localDataTrack.tryPush({ payload: new Uint8Array([0x03]) });

      // 2. A event should have been sent indicating that the data track is no longer "flushed"
      const noLongerFlushedEvent = await managerEvents.waitFor('packetsFlushedChange');
      expect(noLongerFlushedEvent.handle).toStrictEqual(pubHandle);
      expect(noLongerFlushedEvent.isFlushed).toStrictEqual(false);

      // 3. Three packetAvailable events should be emitted, one per pushed frame
      await managerEvents.waitFor('packetAvailable');
      await managerEvents.waitFor('packetAvailable');
      await managerEvents.waitFor('packetAvailable');

      // 4. After the batch is enqueued, call flush() to wait for the SFU to drain them
      let flushed = false;
      const flushPromise = localDataTrack.flush().then(() => {
        flushed = true;
      });

      // 5. Acknowledge two of the three packets -- flush should not resolve yet
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(flushed).toStrictEqual(false);
      expect(managerEvents.areThereBufferedEvents('packetsFlushedChange')).toBe(false);

      // 6. Acknowledge the last packet -- flush resolves once the counter reaches 0
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));

      const flushedEvent = await managerEvents.waitFor('packetsFlushedChange');
      expect(flushedEvent.handle).toStrictEqual(pubHandle);

      await flushPromise;
      expect(flushed).toStrictEqual(true);
    });

    it('should resolve flush() if there are no tryPush calls in flight', async () => {
      const pubHandle = 5;
      const manager = OutgoingDataTrackManager.withDescriptors(
        new Map([
          [
            DataTrackHandle.fromNumber(pubHandle),
            Descriptor.active(
              {
                sid: 'bogus-sid',
                pubHandle,
                name: 'test',
                usesE2ee: false,
              },
              null,
            ),
          ],
        ]),
      );
      const localDataTrack = LocalDataTrack.withExplicitHandle(
        { name: 'track name' },
        manager,
        pubHandle,
      );

      // Call flush, make sure it resolves on its own
      await localDataTrack.flush();
    });

    it('should resolve flush() at the end of a batch of tryPush calls which have all fully sent their data', async () => {
      const pubHandle = 5;
      const manager = OutgoingDataTrackManager.withDescriptors(
        new Map([
          [
            DataTrackHandle.fromNumber(pubHandle),
            Descriptor.active(
              {
                sid: 'bogus-sid',
                pubHandle,
                name: 'test',
                usesE2ee: false,
              },
              null,
            ),
          ],
        ]),
      );
      const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
        'packetAvailable',
      ]);
      const localDataTrack = LocalDataTrack.withExplicitHandle(
        { name: 'track name' },
        manager,
        pubHandle,
      );

      // 1. Run a batch of tryPush calls
      await localDataTrack.tryPush({ payload: new Uint8Array([0x01]) });
      await localDataTrack.tryPush({ payload: new Uint8Array([0x02]) });
      await localDataTrack.tryPush({ payload: new Uint8Array([0x03]) });

      // 2. Three packetAvailable events should be emitted, one per pushed frame
      await managerEvents.waitFor('packetAvailable');
      await managerEvents.waitFor('packetAvailable');
      await managerEvents.waitFor('packetAvailable');

      // 3. Acknowledge all three packets
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));

      // 4. Call flush and ensure that it resolves immediately
      await localDataTrack.flush();
    });

    it('should send packetsFlushedChange events in between tryPush / handlePacketSendComplete calls', async () => {
      const pubHandle = 5;
      const manager = OutgoingDataTrackManager.withDescriptors(
        new Map([
          [
            DataTrackHandle.fromNumber(pubHandle),
            Descriptor.active(
              {
                sid: 'bogus-sid',
                pubHandle,
                name: 'test',
                usesE2ee: false,
              },
              null,
            ),
          ],
        ]),
      );
      const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
        'packetsFlushedChange',
      ]);
      const localDataTrack = LocalDataTrack.withExplicitHandle(
        { name: 'track name' },
        manager,
        pubHandle,
      );

      // 1. Send a single packet frame
      await localDataTrack.tryPush({ payload: new Uint8Array([0x01]) });

      // 2. Ensure the data track is no longer "flushed"
      const noLongerFlushedEvent = await managerEvents.waitFor('packetsFlushedChange');
      expect(noLongerFlushedEvent.handle).toStrictEqual(pubHandle);
      expect(noLongerFlushedEvent.isFlushed).toStrictEqual(false);

      // 3. Send more single packet frames
      await localDataTrack.tryPush({ payload: new Uint8Array([0x02]) });
      await localDataTrack.tryPush({ payload: new Uint8Array([0x03]) });

      // 3. Acknowledge the first two packets
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));
      expect(managerEvents.areThereBufferedEvents('packetsFlushedChange')).toBe(false);

      // 4. Acknowledge the last packet
      manager.handlePacketSendComplete(DataTrackHandle.fromNumber(pubHandle));

      // 4. The data track should now be "flushed" again
      const isFlushedEvent = await managerEvents.waitFor('packetsFlushedChange');
      expect(isFlushedEvent.handle).toStrictEqual(pubHandle);
      expect(isFlushedEvent.isFlushed).toStrictEqual(true);
    });
  });
});
