/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTrackHandle } from './handle';
import { FrameMarker } from './packet';
import { DataTrackExtensions } from './packet/extensions';
import { DataTrackPacketizer, DataTrackPacketizerFrame } from './packetizer';
import { DataTrackTimestamp } from './utils';

describe('DataTrackPacketizer', () => {
  it('should packetize a large payload properly', () => {
    const packetizer = new DataTrackPacketizer(DataTrackHandle.fromNumber(1), 100);
    const packets = Array.from(
      packetizer.packetize(
        {
          payload: new Uint8Array(300).fill(0xbe).buffer,
          extensions: new DataTrackExtensions(),
        },
        { now: DataTrackTimestamp.fromRtpTicks(1804548298) },
      ),
    );

    expect(packets.map((packet) => packet.toJSON())).toStrictEqual([
      {
        header: {
          extensions: {
            e2ee: null,
            userTimestamp: null,
          },
          frameNumber: 0,
          marker: FrameMarker.Start,
          sequence: 0,
          timestamp: 1804548298,
          trackHandle: 1,
        },
        payload: new Uint8Array(88).fill(0xbe),
      },
      {
        header: {
          extensions: {
            e2ee: null,
            userTimestamp: null,
          },
          frameNumber: 0,
          marker: FrameMarker.Inter,
          sequence: 1,
          timestamp: 1804548298,
          trackHandle: 1,
        },
        payload: new Uint8Array(88).fill(0xbe),
      },
      {
        header: {
          extensions: {
            e2ee: null,
            userTimestamp: null,
          },
          frameNumber: 0,
          marker: FrameMarker.Inter,
          sequence: 2,
          timestamp: 1804548298,
          trackHandle: 1,
        },
        payload: new Uint8Array(88).fill(0xbe),
      },
      {
        header: {
          extensions: {
            e2ee: null,
            userTimestamp: null,
          },
          frameNumber: 0,
          marker: FrameMarker.Final,
          sequence: 3,
          timestamp: 1804548298,
          trackHandle: 1,
        },
        payload: new Uint8Array(36 /* 300 total bytes - (88 bytes * 3 full length packets) */).fill(
          0xbe,
        ),
      },
    ]);
  });

  it.each([
    [0, 1_024, 'zero payload'],
    [128, 1_024, 'single packet'],
    [20_480, 1_024, 'multi packet'],
    [40_960, 16_000, 'multi packet mtu 16000'],
  ])('should test packetizer edge cases', (payloadSizeBytes, mtuSizeBytes, label) => {
    const packetizer = new DataTrackPacketizer(DataTrackHandle.fromNumber(1), mtuSizeBytes);

    const frame: DataTrackPacketizerFrame = {
      payload: new Uint8Array(payloadSizeBytes).fill(0xab).buffer,
      extensions: new DataTrackExtensions(),
    };
    const packets = Array.from(
      packetizer.packetize(frame, {
        now: DataTrackTimestamp.fromRtpTicks(0),
      }),
    );

    if (packets.length === 0) {
      expect(payloadSizeBytes, `${label}: Should be no packets for zero payload`).toStrictEqual(0);
    }

    let index = 0;
    for (const packet of packets) {
      const packetHeaderJson = packet.header.toJSON();
      expect(packetHeaderJson.marker).toStrictEqual(
        DataTrackPacketizer.computeFrameMarker(index, packets.length),
      );
      expect(packetHeaderJson.frameNumber).toStrictEqual(0);
      expect(packetHeaderJson.trackHandle).toStrictEqual(1);
      expect(packetHeaderJson.sequence).toStrictEqual(index);
      expect(packetHeaderJson.extensions).toStrictEqual(frame.extensions.toJSON());
      index += 1;
    }
  });

  it.each([
    [0, 1, FrameMarker.Single],
    [0, 10, FrameMarker.Start],
    [4, 10, FrameMarker.Inter],
    [9, 10, FrameMarker.Final],
  ])('should test frame marker utility function', (index, packetCount, expectedMarker) => {
    expect(DataTrackPacketizer.computeFrameMarker(index, packetCount)).toStrictEqual(
      expectedMarker,
    );
  });
});
