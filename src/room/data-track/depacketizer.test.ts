/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTrackDepacketizer } from './depacketizer';
import { DataTrackHandle } from './handle';
import { DataTrackPacket, DataTrackPacketHeader, FrameMarker } from './packet';
import { DataTrackTimestamp, WrapAroundUnsignedInt } from './utils';

const EMPTY_EXTENSIONS_JSON = { userTimestamp: null, e2ee: null };

describe('DataTrackDepacketizer', () => {
  it('should depacketize a single packet', () => {
    const depacketizer = new DataTrackDepacketizer();
    const packet = new DataTrackPacket(
      new DataTrackPacketHeader({
        marker: FrameMarker.Single,
        trackHandle: DataTrackHandle.fromNumber(101),
        sequence: WrapAroundUnsignedInt.u16(0),
        frameNumber: WrapAroundUnsignedInt.u16(103),
        timestamp: DataTrackTimestamp.fromRtpTicks(104),
      }),
      new Uint8Array(0),
    );

    const frame = depacketizer.push(packet);
    expect(frame!.payload).toStrictEqual(new Uint8Array(0));
    expect(frame!.extensions.toJSON()).toStrictEqual(EMPTY_EXTENSIONS_JSON);
  });

  it.each([0, 8, DataTrackDepacketizer.MAX_BUFFER_PACKETS - 2])(
    'should depacketize a multi packet message',
    (interPacketCount) => {
      const depacketizer = new DataTrackDepacketizer();

      const packetPayload = new Uint8Array(8);
      const packetHeaderParams = {
        /* no marker */
        trackHandle: DataTrackHandle.fromNumber(101),
        sequence: WrapAroundUnsignedInt.u16(0),
        frameNumber: WrapAroundUnsignedInt.u16(103),
        timestamp: DataTrackTimestamp.fromRtpTicks(104),
      };

      const startPacket = new DataTrackPacket(
        new DataTrackPacketHeader({ ...packetHeaderParams, marker: FrameMarker.Start }),
        packetPayload,
      );
      const startPacketFrame = depacketizer.push(startPacket);
      expect(startPacketFrame).toBeNull();

      for (let i = 0; i < interPacketCount; i += 1) {
        const interPacket = new DataTrackPacket(
          new DataTrackPacketHeader({
            ...packetHeaderParams,
            marker: FrameMarker.Inter,
            sequence: WrapAroundUnsignedInt.u16(i),
          }),
          packetPayload,
        );
        const interPacketFrame = depacketizer.push(interPacket);
        expect(interPacketFrame).toBeNull();
      }

      const finalPacket = new DataTrackPacket(
        new DataTrackPacketHeader({
          ...packetHeaderParams,
          marker: FrameMarker.Final,
          sequence: WrapAroundUnsignedInt.u16(interPacketCount),
        }),
        packetPayload,
      );

      const finalPacketFrame = depacketizer.push(finalPacket);
      expect(finalPacketFrame!.extensions.toJSON()).toStrictEqual(EMPTY_EXTENSIONS_JSON);
      expect(finalPacketFrame!.payload.byteLength).toStrictEqual(
        packetPayload.byteLength * (1 /* start */ + interPacketCount + 1) /* final */,
      );
    },
  );

  it('should throw "interrupted" when frame number changes midway through depacketizing', () => {
    const depacketizer = new DataTrackDepacketizer();
    const packetA = new DataTrackPacket(
      new DataTrackPacketHeader({
        marker: FrameMarker.Start,
        trackHandle: DataTrackHandle.fromNumber(1),
        sequence: WrapAroundUnsignedInt.u16(0),
        frameNumber: WrapAroundUnsignedInt.u16(5 /* starts on frame 5 */),
        timestamp: DataTrackTimestamp.fromRtpTicks(0),
      }),
      new Uint8Array(8),
    );

    const frameA = depacketizer.push(packetA);
    expect(frameA).toBeNull();

    // Now feed in a packet with a different frame number:
    const nextFrameNumber = packetA.header.frameNumber.value + 1;
    const packetB = new DataTrackPacket(
      new DataTrackPacketHeader({
        marker: FrameMarker.Start,
        trackHandle: DataTrackHandle.fromNumber(1),
        sequence: WrapAroundUnsignedInt.u16(0),
        frameNumber: WrapAroundUnsignedInt.u16(nextFrameNumber),
        timestamp: DataTrackTimestamp.fromRtpTicks(0),
      }),
      new Uint8Array(8),
    );

    expect(() => depacketizer.push(packetB, { errorOnPartialFrames: true })).toThrowError(
      'Frame 5 dropped: Interrupted by the start of a new frame',
    );
  });

  it('should throw "incomplete" when final packet comes too early', () => {
    const depacketizer = new DataTrackDepacketizer();

    const packetPayload = new Uint8Array(8);
    const packetHeaderParams = {
      /* no marker */
      trackHandle: DataTrackHandle.fromNumber(101),
      sequence: WrapAroundUnsignedInt.u16(0),
      frameNumber: WrapAroundUnsignedInt.u16(103),
      timestamp: DataTrackTimestamp.fromRtpTicks(104),
    };

    const startPacket = new DataTrackPacket(
      new DataTrackPacketHeader({ ...packetHeaderParams, marker: FrameMarker.Start }),
      packetPayload,
    );
    const startPacketFrame = depacketizer.push(startPacket);
    expect(startPacketFrame).toBeNull();

    const finalPacket = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Final,
        sequence: WrapAroundUnsignedInt.u16(3),
      }),
      packetPayload,
    );
    expect(() => depacketizer.push(finalPacket)).toThrowError(
      'Frame 103 dropped: Not all packets received before final packet. Received 2 packets, expected 4 packets.',
    );
  });

  it('should throw "unknownFrame" when a non single packet frame does not start with a "start" packet', () => {
    const depacketizer = new DataTrackDepacketizer();

    const packet = new DataTrackPacket(
      new DataTrackPacketHeader({
        marker: FrameMarker.Inter,
        trackHandle: DataTrackHandle.fromNumber(101),
        sequence: WrapAroundUnsignedInt.u16(0),
        frameNumber: WrapAroundUnsignedInt.u16(103),
        timestamp: DataTrackTimestamp.fromRtpTicks(104),
      }),
      new Uint8Array(8),
    );
    expect(() => depacketizer.push(packet)).toThrowError(
      'Frame 103 dropped: Initial packet was never received.',
    );
  });

  it('should throw "bufferFull" when too many packets have been sent', () => {
    const depacketizer = new DataTrackDepacketizer();

    const packetPayload = new Uint8Array(8);
    const packetHeaderParams = {
      /* no marker */
      trackHandle: DataTrackHandle.fromNumber(101),
      sequence: WrapAroundUnsignedInt.u16(0),
      frameNumber: WrapAroundUnsignedInt.u16(103),
      timestamp: DataTrackTimestamp.fromRtpTicks(104),
    };

    const startPacket = new DataTrackPacket(
      new DataTrackPacketHeader({ ...packetHeaderParams, marker: FrameMarker.Start }),
      packetPayload,
    );
    const startPacketFrame = depacketizer.push(startPacket);
    expect(startPacketFrame).toBeNull();

    for (let i = 0; i < DataTrackDepacketizer.MAX_BUFFER_PACKETS; i += 1) {
      const interPacket = new DataTrackPacket(
        new DataTrackPacketHeader({
          ...packetHeaderParams,
          marker: FrameMarker.Inter,
          sequence: WrapAroundUnsignedInt.u16(i),
        }),
        packetPayload,
      );
      const interPacketFrame = depacketizer.push(interPacket);
      expect(interPacketFrame).toBeNull();
    }

    // Send one final inter packet (so one more than the max), and make sure the error case gets hit
    const extraInterPacket = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Final,
        sequence: WrapAroundUnsignedInt.u16(DataTrackDepacketizer.MAX_BUFFER_PACKETS),
      }),
      packetPayload,
    );
    expect(() => depacketizer.push(extraInterPacket)).toThrowError(
      'Frame 103 dropped: Reorder buffer is full.',
    );
  });
});
