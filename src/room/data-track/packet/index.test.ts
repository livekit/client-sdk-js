/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataTrackPacket, DataTrackPacketHeader, FrameMarker } from '.';
import { DataTrackTimestamp, WrapAroundUnsignedInt } from '../utils';
import { DataTrackHandle } from '../handle';
import { DataTrackE2eeExtension, DataTrackExtensions, DataTrackUserTimestampExtension } from './extensions';

describe('DataTrackPacket', () => {
  describe('Serialization', () => {
    it('should serialize a single packet', async () => {
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
      expect(packet.toBinary()).toStrictEqual(new Uint8Array([
        0x18, // Version 0, final, extension
        0, // Reserved
        0, // Track handle (big endian)
        101,
        0, // Sequence (big endian)
        102,
        0, // Frame number (bug endian)
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
      ]));
    });
    it('should serialize a final packet with extensions', async () => {
      const header = new DataTrackPacketHeader({
        marker: FrameMarker.Final,
        trackHandle: DataTrackHandle.fromNumber(0x8811),
        sequence: WrapAroundUnsignedInt.u16(0x4422),
        frameNumber: WrapAroundUnsignedInt.u16(0x4411),
        timestamp: DataTrackTimestamp.fromRtpTicks(0x44221188),
        extensions: new DataTrackExtensions({
          userTimestamp: new DataTrackUserTimestampExtension(0x4411221111118811n),
          e2ee: new DataTrackE2eeExtension(
            0xFA,
            new Uint8Array(12).fill(0x3c),
          ),
        }),
      });

      const payloadBytes = new Uint8Array(32).fill(0xfa);

      const packet = new DataTrackPacket(header, payloadBytes.buffer);

      expect(packet.toBinaryLengthBytes()).toStrictEqual(78);
      expect(packet.toBinary()).toStrictEqual(new Uint8Array([
        0xc, // Version 0, final, extension
        0, // Reserved
        136, // Track handle (big endian)
        17,
        68, // Sequence (big endian)
        34,
        68, // Frame number (bug endian)
        17,
        68, // Timestamp (big endian)
        34,
        17,
        136,
        0, // Extension words (big endian)
        8,

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
      ]));
    });
    it('should serialize a start packet with only the e2ee extension', async () => {
      const header = new DataTrackPacketHeader({
        marker: FrameMarker.Start,
        trackHandle: DataTrackHandle.fromNumber(101),
        sequence: WrapAroundUnsignedInt.u16(102),
        frameNumber: WrapAroundUnsignedInt.u16(103),
        timestamp: DataTrackTimestamp.fromRtpTicks(104),
        extensions: new DataTrackExtensions({
          e2ee: new DataTrackE2eeExtension(
            0xFA,
            new Uint8Array(12).fill(0x3c),
          ),
        }),
      });

      const payloadBytes = new Uint8Array(32).fill(0xfa);

      const packet = new DataTrackPacket(header, payloadBytes.buffer);

      expect(packet.toBinaryLengthBytes()).toStrictEqual(66);
      expect(packet.toBinary()).toStrictEqual(new Uint8Array([
        0x14, // Version 0, start, extension
        0, // Reserved
        0, // Track handle (big endian)
        101,
        0, // Sequence (big endian)
        102,
        0, // Frame number (bug endian)
        103,
        0, // Timestamp (big endian)
        0,
        0,
        104,
        0, // Extension words (big endian)
        5,

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
      ]));
    });
  });
});
