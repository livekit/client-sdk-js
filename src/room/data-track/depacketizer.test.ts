/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataTrackDepacketizer from './depacketizer';
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
      new Uint8Array(8),
    );

    const frame = depacketizer.push(packet);
    expect(frame!.payload).toStrictEqual(new Uint8Array(8));
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
            sequence: WrapAroundUnsignedInt.u16(i + 1),
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
          sequence: WrapAroundUnsignedInt.u16(interPacketCount + 1),
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

    for (let i = 0; i < DataTrackDepacketizer.MAX_BUFFER_PACKETS - 1; i += 1) {
      const interPacket = new DataTrackPacket(
        new DataTrackPacketHeader({
          ...packetHeaderParams,
          marker: FrameMarker.Inter,
          sequence: WrapAroundUnsignedInt.u16(i + 1),
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

  it('should depacketize two frames worth of packets', () => {
    const depacketizer = new DataTrackDepacketizer();

    const packetPayload = new Uint8Array(8);
    const packetHeaderParams = {
      /* no marker */
      trackHandle: DataTrackHandle.fromNumber(101),
      sequence: WrapAroundUnsignedInt.u16(0),
      frameNumber: WrapAroundUnsignedInt.u16(103),
      timestamp: DataTrackTimestamp.fromRtpTicks(104),
    };

    // Process first frame successfully
    const startPacketA = new DataTrackPacket(
      new DataTrackPacketHeader({ ...packetHeaderParams, marker: FrameMarker.Start }),
      packetPayload,
    );
    expect(depacketizer.push(startPacketA)).toBeNull();

    const interPacketA = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Inter,
        sequence: WrapAroundUnsignedInt.u16(1),
      }),
      packetPayload,
    );
    expect(depacketizer.push(interPacketA)).toBeNull();

    const finalPacketA = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Final,
        sequence: WrapAroundUnsignedInt.u16(2),
      }),
      packetPayload,
    );
    expect(depacketizer.push(finalPacketA)).not.toBeNull();

    // Now process another frame successfully
    const startPacketB = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Start,
        sequence: WrapAroundUnsignedInt.u16(3),
        frameNumber: WrapAroundUnsignedInt.u16(999),
      }),
      packetPayload,
    );
    expect(depacketizer.push(startPacketB)).toBeNull();

    const interPacketB = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Inter,
        sequence: WrapAroundUnsignedInt.u16(4),
        frameNumber: WrapAroundUnsignedInt.u16(999),
      }),
      packetPayload,
    );
    expect(depacketizer.push(interPacketB)).toBeNull();

    const finalPacketB = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Final,
        sequence: WrapAroundUnsignedInt.u16(5),
        frameNumber: WrapAroundUnsignedInt.u16(999),
      }),
      packetPayload,
    );
    expect(depacketizer.push(finalPacketB)).not.toBeNull();
  });

  it('should ensure that if duplicate packets with the same sequence number are received, the last packet wins', () => {
    const depacketizer = new DataTrackDepacketizer();

    const packetHeaderParams = {
      /* no marker */
      trackHandle: DataTrackHandle.fromNumber(101),
      sequence: WrapAroundUnsignedInt.u16(0),
      frameNumber: WrapAroundUnsignedInt.u16(103),
      timestamp: DataTrackTimestamp.fromRtpTicks(104),
    };

    const startPacket = new DataTrackPacket(
      new DataTrackPacketHeader({ ...packetHeaderParams, marker: FrameMarker.Start }),
      new Uint8Array(0),
    );
    expect(depacketizer.push(startPacket)).toBeNull();

    // First version of the inter packet
    const interPacketA = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Inter,
        sequence: WrapAroundUnsignedInt.u16(1),
      }),
      new Uint8Array([0x01, 0x02, 0x03]),
    );
    expect(depacketizer.push(interPacketA)).toBeNull();

    // Second version of the inter packet
    const interPacketB = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Inter,
        sequence: WrapAroundUnsignedInt.u16(1),
      }),
      new Uint8Array([0x04, 0x05, 0x06]),
    );
    expect(depacketizer.push(interPacketB)).toBeNull();

    const finalPacket = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Final,
        sequence: WrapAroundUnsignedInt.u16(2),
      }),
      new Uint8Array(0),
    );
    expect(depacketizer.push(finalPacket)!.payload).toStrictEqual(
      new Uint8Array([0x04, 0x05, 0x06]),
    );
  });

  it('should ensure packets can be received out of order', () => {
    const depacketizer = new DataTrackDepacketizer();

    const packetHeaderParams = {
      /* no marker */
      trackHandle: DataTrackHandle.fromNumber(101),
      sequence: WrapAroundUnsignedInt.u16(0),
      frameNumber: WrapAroundUnsignedInt.u16(103),
      timestamp: DataTrackTimestamp.fromRtpTicks(104),
    };

    const startPacket = new DataTrackPacket(
      new DataTrackPacketHeader({ ...packetHeaderParams, marker: FrameMarker.Start }),
      new Uint8Array(0),
    );
    expect(depacketizer.push(startPacket)).toBeNull();

    // Second inter packet comes first
    const interPacketB = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Inter,
        sequence: WrapAroundUnsignedInt.u16(2),
      }),
      new Uint8Array([0x04, 0x05, 0x06]),
    );
    expect(depacketizer.push(interPacketB)).toBeNull();

    // First inter packet comes second
    const interPacketA = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Inter,
        sequence: WrapAroundUnsignedInt.u16(1),
      }),
      new Uint8Array([0x01, 0x02, 0x03]),
    );
    expect(depacketizer.push(interPacketA)).toBeNull();

    const finalPacket = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Final,
        sequence: WrapAroundUnsignedInt.u16(3),
      }),
      new Uint8Array(0),
    );
    expect(depacketizer.push(finalPacket)!.payload).toStrictEqual(
      new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
    );
  });

  it('should be able to continue to depacketize if a bad packet puts the depacketizer into a bad state', () => {
    const depacketizer = new DataTrackDepacketizer();

    const packetHeaderParams = {
      /* no marker */
      trackHandle: DataTrackHandle.fromNumber(101),
      sequence: WrapAroundUnsignedInt.u16(0),
      frameNumber: WrapAroundUnsignedInt.u16(103),
      timestamp: DataTrackTimestamp.fromRtpTicks(104),
    };

    // First, put the depacketizer into a bad state by feeding in a final packet
    const preemptiveFinalPacket = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Final,
        frameNumber: WrapAroundUnsignedInt.u16(102),
        sequence: WrapAroundUnsignedInt.u16(0),
      }),
      new Uint8Array(0),
    );
    expect(() => depacketizer.push(preemptiveFinalPacket)).toThrowError(
      'Frame 102 dropped: Initial packet was never received.',
    );

    // Then, try to parse a valid multi byte frame made up of three packets
    const startPacket = new DataTrackPacket(
      new DataTrackPacketHeader({ ...packetHeaderParams, marker: FrameMarker.Start }),
      new Uint8Array(0),
    );
    expect(depacketizer.push(startPacket)).toBeNull();

    const interPacket = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Inter,
        sequence: WrapAroundUnsignedInt.u16(1),
      }),
      new Uint8Array([0x01, 0x02, 0x03]),
    );
    expect(depacketizer.push(interPacket)).toBeNull();

    const finalPacket = new DataTrackPacket(
      new DataTrackPacketHeader({
        ...packetHeaderParams,
        marker: FrameMarker.Final,
        sequence: WrapAroundUnsignedInt.u16(2),
      }),
      new Uint8Array(0),
    );
    expect(depacketizer.push(finalPacket)!.payload).toStrictEqual(
      new Uint8Array([0x01, 0x02, 0x03]),
    );
  });
});
