/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTrackPacket, DataTrackPacketHeader, FrameMarker } from '.';
import { DataTrackHandle } from '../handle';
import { DataTrackTimestamp, WrapAroundUnsignedInt } from '../utils';
import { EXT_FLAG_SHIFT } from './constants';
import {
  DataTrackE2eeExtension,
  DataTrackExtensionTag,
  DataTrackExtensions,
  DataTrackUserTimestampExtension,
} from './extensions';

describe('DataTrackPacket', () => {
  describe('Serialization', () => {
    it('should serialize a single packet', () => {
      const header = new DataTrackPacketHeader({
        marker: FrameMarker.Single,
        trackHandle: DataTrackHandle.fromNumber(101),
        sequence: WrapAroundUnsignedInt.u16(102),
        frameNumber: WrapAroundUnsignedInt.u16(103),
        timestamp: DataTrackTimestamp.fromRtpTicks(104),
      });

      const payloadBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

      const packet = new DataTrackPacket(header, payloadBytes.buffer);

      expect(packet.toBinaryLengthBytes()).toStrictEqual(22);
      expect(packet.toBinary()).toStrictEqual(
        new Uint8Array([
          0x18, // Version 0, single, extension
          0, // Reserved
          0, // Track handle (big endian)
          101,
          0, // Sequence (big endian)
          102,
          0, // Frame number (big endian)
          103,
          0, // Timestamp (big endian)
          0,
          0,
          104,
          /* (No extension words value) */
          0, // Payload
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
        ]),
      );
    });
    it('should serialize a final packet with extensions', () => {
      const header = new DataTrackPacketHeader({
        marker: FrameMarker.Final,
        trackHandle: DataTrackHandle.fromNumber(0x8811),
        sequence: WrapAroundUnsignedInt.u16(0x4422),
        frameNumber: WrapAroundUnsignedInt.u16(0x4411),
        timestamp: DataTrackTimestamp.fromRtpTicks(0x44221188),
        extensions: new DataTrackExtensions({
          userTimestamp: new DataTrackUserTimestampExtension(0x4411221111118811n),
          e2ee: new DataTrackE2eeExtension(0xfa, new Uint8Array(12).fill(0x3c)),
        }),
      });

      const payloadBytes = new Uint8Array(32).fill(0xfa);

      const packet = new DataTrackPacket(header, payloadBytes.buffer);

      expect(packet.toBinaryLengthBytes()).toStrictEqual(78);
      expect(packet.toBinary()).toStrictEqual(
        new Uint8Array([
          0xc, // Version 0, final, extension
          0, // Reserved
          136, // Track handle (big endian)
          17,
          68, // Sequence (big endian)
          34,
          68, // Frame number (big endian)
          17,
          68, // Timestamp (big endian)
          34,
          17,
          136,
          0, // Rtp oriented extension words (big endian)
          7,

          // E2ee extension
          0, // ID 1 (big endian)
          1,
          0, // Length 12 (big endian)
          12,
          0xfa, // Key index
          0x3c, // Iv array
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,

          // User timestamp extension
          0, // ID 2 (big endian)
          2,
          0, // Length 7 (big endian)
          7,
          68, // Timestamp value (big endian)
          17,
          34,
          17,
          17,
          17,
          136,
          17,

          0, // Extension padding
          0,
          0,

          0xfa, // Payload
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
        ]),
      );
    });
    it('should serialize a start packet with only the e2ee extension', () => {
      const header = new DataTrackPacketHeader({
        marker: FrameMarker.Start,
        trackHandle: DataTrackHandle.fromNumber(101),
        sequence: WrapAroundUnsignedInt.u16(102),
        frameNumber: WrapAroundUnsignedInt.u16(103),
        timestamp: DataTrackTimestamp.fromRtpTicks(104),
        extensions: new DataTrackExtensions({
          e2ee: new DataTrackE2eeExtension(0xfa, new Uint8Array(12).fill(0x3c)),
        }),
      });

      const payloadBytes = new Uint8Array(32).fill(0xfa);

      const packet = new DataTrackPacket(header, payloadBytes.buffer);

      expect(packet.toBinaryLengthBytes()).toStrictEqual(66);
      expect(packet.toBinary()).toStrictEqual(
        new Uint8Array([
          0x14, // Version 0, start, extension
          0, // Reserved
          0, // Track handle (big endian)
          101,
          0, // Sequence (big endian)
          102,
          0, // Frame number (big endian)
          103,
          0, // Timestamp (big endian)
          0,
          0,
          104,
          0, // RTP oriented extension words (big endian)
          4,

          // E2ee extension
          0, // ID 1 (big endian)
          1,
          0, // Length 12 (big endian)
          12,
          0xfa, // Key index
          0x3c, // Iv array
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,
          0x3c,

          0, // Extension padding
          0,
          0,

          0xfa, // Payload
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
          0xfa,
        ]),
      );
    });

    it('should be unable to serialize a packet header into a DataView which is too small', () => {
      const header = new DataTrackPacketHeader({
        marker: FrameMarker.Single,
        trackHandle: DataTrackHandle.fromNumber(101),
        sequence: WrapAroundUnsignedInt.u16(102),
        frameNumber: WrapAroundUnsignedInt.u16(103),
        timestamp: DataTrackTimestamp.fromRtpTicks(104),
      });
      const payloadBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const packet = new DataTrackPacket(header, payloadBytes.buffer);

      const twoByteLongDataView = new DataView(new ArrayBuffer(2));
      expect(() => packet.toBinaryInto(twoByteLongDataView)).toThrow('Buffer cannot fit header');
    });
    it('should be unable to serialize a packet payload into a DataView which is too small', () => {
      const header = new DataTrackPacketHeader({
        marker: FrameMarker.Single,
        trackHandle: DataTrackHandle.fromNumber(101),
        sequence: WrapAroundUnsignedInt.u16(102),
        frameNumber: WrapAroundUnsignedInt.u16(103),
        timestamp: DataTrackTimestamp.fromRtpTicks(104),
      });
      const payloadBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const packet = new DataTrackPacket(header, payloadBytes.buffer);

      const fourteenByteLongDataView = new DataView(
        new ArrayBuffer(14 /* 12 byte header + 2 extra bytes */),
      );
      expect(() => packet.toBinaryInto(fourteenByteLongDataView)).toThrow(
        'Buffer cannot fit payload',
      );
    });
  });

  describe('Deserialization', () => {
    const VALID_PACKET_BYTES = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0];

    it('should deserialize a single packet', () => {
      const [packet, bytes] = DataTrackPacket.fromBinary(
        new Uint8Array([
          0x18, // Version 0, single, extension
          0, // Reserved
          0, // Track handle (big endian)
          101,
          0, // Sequence (big endian)
          102,
          0, // Frame number (big endian)
          103,
          0, // Timestamp (big endian)
          0,
          0,
          104,
          /* (No extension words value) */
          1, // Payload
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
        ]),
      );

      expect(bytes).toStrictEqual(21);
      expect(packet.toJSON()).toStrictEqual({
        header: {
          frameNumber: 103,
          marker: FrameMarker.Single,
          sequence: 102,
          timestamp: 104,
          trackHandle: 101,
          extensions: {
            e2ee: null,
            userTimestamp: null,
          },
        },
        payload: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer,
      });
    });

    it('should fail to deserialize a too short buffer', () => {
      const packetBytes = new Uint8Array(VALID_PACKET_BYTES);

      expect(() => DataTrackPacket.fromBinary(packetBytes.slice(0, 5))).toThrow(
        'Too short to contain a valid header',
      );
    });

    it('should fail to deserialize a packet including extensions but missing the ext words value', () => {
      const packetBytes = new Uint8Array(VALID_PACKET_BYTES);
      packetBytes[0] |= 1 << EXT_FLAG_SHIFT; // Extension flag - should have ext word indicator here

      expect(() => DataTrackPacket.fromBinary(packetBytes)).toThrow(
        'Extension word indicator is missing',
      );
    });

    it('should fail to deserialize a packet which overruns headers', () => {
      const packetBytes = new Uint8Array([
        ...VALID_PACKET_BYTES,

        0, // Extension word (big endian)
        1,
      ]);
      packetBytes[0] |= 1 << EXT_FLAG_SHIFT; // Extension flag - should have ext word indicator here

      expect(() => DataTrackPacket.fromBinary(packetBytes)).toThrow(
        'Header exceeds total packet length',
      );
    });

    it('should fail to deserialize a packet with an unsupported version', () => {
      const packetBytes = new Uint8Array(VALID_PACKET_BYTES);
      packetBytes[0] = 0x20; // Version 1 (not supported yet)

      expect(() => DataTrackPacket.fromBinary(packetBytes)).toThrow('Unsupported version 1');
    });

    it('should deserialize base header', () => {
      const [packet, bytes] = DataTrackPacket.fromBinary(
        new Uint8Array([
          0x8, // Version 0, final, extension
          0x0, // Reserved
          0x88, // Track handle (big endian)
          0x11,
          0x44, // Sequence (big endian)
          0x22,
          0x44, // Frame number (big endian)
          0x11,
          0x44, // Timestamp (big endian)
          0x22,
          0x11,
          0x88,
        ]),
      );

      expect(bytes).toStrictEqual(12);
      expect(packet.toJSON()).toStrictEqual({
        header: {
          marker: FrameMarker.Final,
          trackHandle: 0x8811,
          sequence: 0x4422,
          frameNumber: 0x4411,
          timestamp: 0x44221188,
          extensions: {
            e2ee: null,
            userTimestamp: null,
          },
        },
        payload: new Uint8Array([]).buffer,
      });
    });

    it.each([0, 1, 24])('should skip extension padding', (extensionWords) => {
      const packetBytes = new Uint8Array([
        ...VALID_PACKET_BYTES,

        0, // Extension words (big endian)
        extensionWords,

        ...new Array((extensionWords + 1) /* RTP oriented extension words */ * 4).fill(0), // Padding
      ]);
      packetBytes[0] |= 1 << EXT_FLAG_SHIFT; // Extension flag

      const [packet] = DataTrackPacket.fromBinary(packetBytes);

      expect(new Uint8Array(packet.toJSON().payload).byteLength).toStrictEqual(0);
    });

    it('should deserialize e2ee extension properly', () => {
      const packetBytes = new Uint8Array([
        ...VALID_PACKET_BYTES,

        0, // RTP oriented extension words (big endian)
        4,

        // E2ee extension
        0, // ID 1 (big endian)
        1,
        0, // Length 12 (big endian)
        12,
        0xfa, // Key index
        0x3c, // Iv array
        0x3c,
        0x3c,
        0x3c,
        0x3c,
        0x3c,
        0x3c,
        0x3c,
        0x3c,
        0x3c,
        0x3c,
        0x3c,

        0, // Padding
        0,
        0,
      ]);
      packetBytes[0] |= 1 << EXT_FLAG_SHIFT; // Extension flag

      const [packet] = DataTrackPacket.fromBinary(packetBytes);

      expect(packet.toJSON().header.extensions.e2ee).toStrictEqual({
        tag: DataTrackExtensionTag.E2ee,
        lengthBytes: 13,
        keyIndex: 0xfa,
        iv: new Uint8Array(12).fill(0x3c),
      });
    });

    it('should deserialize user timestamp extension properly', () => {
      const packetBytes = new Uint8Array([
        ...VALID_PACKET_BYTES,

        0, // Extension words (big endian)
        2,

        // User timestamp extension
        0, // ID 2 (big endian)
        2,
        0, // Length 7 (big endian)
        7,
        0x44, // Timestamp (big endian)
        0x11,
        0x22,
        0x11,
        0x11,
        0x11,
        0x88,
        0x11,
      ]);
      packetBytes[0] |= 1 << EXT_FLAG_SHIFT; // Extension flag

      const [packet] = DataTrackPacket.fromBinary(packetBytes);

      expect(packet.toJSON().header.extensions.userTimestamp).toStrictEqual({
        tag: DataTrackExtensionTag.UserTimestamp,
        lengthBytes: 8,
        timestamp: 0x4411221111118811n,
      });
    });

    it('should deserialize unknown extension properly', () => {
      const packetBytes = new Uint8Array([
        ...VALID_PACKET_BYTES,

        0, // RTP oriented extension words (big endian)
        2,

        // Unknown / potential future extension
        0, // ID 8 (big endian)
        8,
        0, // Length 12 (big endian)
        6,
        0x1, // Payload
        0x2,
        0x3,
        0x4,
        0x5,
        0x6,

        0x0, // Padding
        0x0,
      ]);
      packetBytes[0] |= 1 << EXT_FLAG_SHIFT; // Extension flag

      const [packet] = DataTrackPacket.fromBinary(packetBytes);

      expect(packet.toJSON().header.extensions).toStrictEqual({
        userTimestamp: null,
        e2ee: null,
      });
    });

    it('should ensure extensions are word aligned', () => {
      const packetBytes = new Uint8Array([
        ...VALID_PACKET_BYTES,

        0, // RTP oriented extension words (big endian)
        0,

        0x0, // Padding, missing one byte
        0x0,
        0x0,
      ]);
      packetBytes[0] |= 1 << EXT_FLAG_SHIFT; // Extension flag

      expect(() => DataTrackPacket.fromBinary(packetBytes)).toThrow(
        'Header exceeds total packet length',
      );
    });
  });

  describe('Round trip serialization + deserialization', () => {
    it('should serialize a single packet', () => {
      const header = new DataTrackPacketHeader({
        marker: FrameMarker.Single,
        trackHandle: DataTrackHandle.fromNumber(101),
        sequence: WrapAroundUnsignedInt.u16(102),
        frameNumber: WrapAroundUnsignedInt.u16(103),
        timestamp: DataTrackTimestamp.fromRtpTicks(104),
      });

      const payloadBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);

      const encodedPacket = new DataTrackPacket(header, payloadBytes.buffer);

      expect(encodedPacket.toBinaryLengthBytes()).toStrictEqual(21);
      expect(encodedPacket.toBinary()).toStrictEqual(
        new Uint8Array([
          0x18, // Version 0, single, extension
          0, // Reserved
          0, // Track handle (big endian)
          101,
          0, // Sequence (big endian)
          102,
          0, // Frame number (big endian)
          103,
          0, // Timestamp (big endian)
          0,
          0,
          104,
          /* (No extension words value) */
          1, // Payload
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
        ]),
      );

      const [decodedPacket, bytes] = DataTrackPacket.fromBinary(encodedPacket.toBinary());

      expect(bytes).toStrictEqual(21);
      expect(decodedPacket.toJSON()).toStrictEqual({
        header: {
          frameNumber: 103,
          marker: FrameMarker.Single,
          sequence: 102,
          timestamp: 104,
          trackHandle: 101,
          extensions: {
            e2ee: null,
            userTimestamp: null,
          },
        },
        payload: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]).buffer,
      });
    });
  });
});
