/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeToEvents } from '../../../utils/subscribeToEvents';
import { EncryptionProvider } from '../e2ee';
import { DataTrackHandle } from '../handle';
import { DataTrackPacket, FrameMarker } from '../packet';
import OutgoingDataTrackManager, {
  DataTrackOutgoingManagerCallbacks,
  Descriptor,
} from './OutgoingDataTrackManager';
import { DataTrackPublishError } from './errors';

/** A fake "encryption" provider used for test purposes. Adds a prefix to the payload. */
const PrefixingEncryptionProvider: EncryptionProvider = {
  encrypt(payload: Uint8Array) {
    const prefix = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

    const output = new Uint8Array(prefix.length + payload.length);
    output.set(prefix, 0);
    output.set(payload, prefix.length);

    return {
      payload: output,
      iv: new Uint8Array(12), // Just leaving this empty, is this a bad idea?
      keyIndex: 0,
    };
  },
};

describe('DataTrackOutgoingManager', () => {
  it('should test track publishing (ok case)', async () => {
    const manager = new OutgoingDataTrackManager();
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
    ]);

    // 1. Publish a data track
    const publishRequestPromise = manager.publishRequest({ name: 'test' });

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
    const localDataTrack = await publishRequestPromise;
    expect(localDataTrack.isPublished()).toStrictEqual(true);
  });

  it('should test track publishing (error case)', async () => {
    const manager = new OutgoingDataTrackManager();
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
    ]);

    // 1. Publish a data track
    const publishRequestPromise = manager.publishRequest({ name: 'test' });

    // 2. This publish request should be sent along to the SFU
    const sfuPublishEvent = await managerEvents.waitFor('sfuPublishRequest');

    // 3. Respond to the SFU publish request with an ERROR response
    manager.receivedSfuPublishResponse(sfuPublishEvent.handle, {
      type: 'error',
      error: DataTrackPublishError.limitReached(),
    });

    // Make sure that the rejection bubbles back to the caller
    expect(publishRequestPromise).rejects.toThrowError('Data track publication limit reached');
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
        'packetsAvailable',
      ]);

      const localDataTrack = manager.createLocalDataTrack(5)!;
      expect(localDataTrack).not.toStrictEqual(null);

      // Kick off sending the bytes...
      localDataTrack.tryPush(inputBytes);

      // ... and make sure the corresponding events are emitted to tell the SFU to send the packets
      for (const outputPacketJson of outputPacketsJson) {
        const packetBytes = await managerEvents.waitFor('packetsAvailable');
        const [packet] = DataTrackPacket.fromBinary(packetBytes.bytes);

        expect(packet.toJSON()).toStrictEqual(outputPacketJson);
      }
    },
  );

  it('should send e2ee encrypted datatrack payload', async () => {
    const manager = new OutgoingDataTrackManager({
      encryptionProvider: PrefixingEncryptionProvider,
    });
    const managerEvents = subscribeToEvents<DataTrackOutgoingManagerCallbacks>(manager, [
      'sfuPublishRequest',
      'packetsAvailable',
    ]);

    // 1. Publish a data track
    const publishRequestPromise = manager.publishRequest({ name: 'test' });

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
    const localDataTrack = await publishRequestPromise;
    expect(localDataTrack.isPublished()).toStrictEqual(true);

    // Kick off sending the payload bytes
    localDataTrack.tryPush(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]));

    // Make sure the packet that was sent was encrypted with the PrefixingEncryptionProvider
    const packetBytes = await managerEvents.waitFor('packetsAvailable');
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
    const shutdownPromise = manager.shutdown();

    // The pending data track should be cancelled
    expect(pendingDescriptor.completionFuture.promise).rejects.toThrowError('Room disconnected');

    // And the active data track should be requested to be unpublished
    const unpublishEvent = await managerEvents.waitFor('sfuUnpublishRequest');
    expect(unpublishEvent.handle).toStrictEqual(6);

    // Acknowledge that the unpublish has occurred
    manager.receivedSfuUnpublishResponse(DataTrackHandle.fromNumber(6));

    await shutdownPromise;
  });

  // FIXME: add e2ee tests
});
