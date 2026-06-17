import { ClientInfo_Capability, type DataPacket } from '@livekit/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import log from '../../../logger';
import {
    CLIENT_PROTOCOL_DATA_STREAM_RPC,
  CLIENT_PROTOCOL_DATA_STREAM_V2,
  CLIENT_PROTOCOL_DEFAULT,
} from '../../../version';
import type RTCEngine from '../../RTCEngine';
import {
  COMPRESSION_ATTRIBUTE,
  COMPRESSION_DEFLATE_RAW,
  INLINE_PAYLOAD_ATTRIBUTE,
} from '../constants';
import OutgoingDataStreamManager from './OutgoingDataStreamManager';

/** Builds a low quality random string of the given length. */
function randomText(length: number): string {
  let s = '';
  while (s.length < length) {
    s += Math.random().toString(36).slice(2);
  }
  return s.slice(0, length);
}

/** Fills a buffer with uniform random bytes — genuinely incompressible. */
function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  // crypto.getRandomValues rejects requests over 65536 bytes, so chunk it.
  for (let offset = 0; offset < length; offset += 65536) {
    crypto.getRandomValues(out.subarray(offset, offset + 65536));
  }
  return out;
}

/**
 * @param participants the remote participants in the room, mapped from identity to the client
 *   protocol each advertises. Defaults to a single v2 participant named "bob".
 */
function createManager(
  participants: Record<string, number | [number, Array<number>]> = { bob: CLIENT_PROTOCOL_DATA_STREAM_V2 },
) {
  const sentPackets: DataPacket[] = [];
  const engine = {
    sendDataPacket: vi.fn(async (packet: DataPacket) => {
      sentPackets.push(packet);
    }),
    e2eeManager: undefined,
    once: vi.fn(),
    off: vi.fn(),
  } as unknown as RTCEngine;
  const manager = new OutgoingDataStreamManager(
    engine,
    log,
    (identity) => (Array.isArray(participants[identity]) ? participants[identity][0] : participants[identity]) ?? CLIENT_PROTOCOL_DEFAULT,
    (identity) => Array.isArray(participants[identity]) ? participants[identity][1] : [ClientInfo_Capability.CAP_COMPRESSION_DEFLATE_RAW],
    () => Object.keys(participants),
  );
  return { manager, sentPackets };
}

function headerOf(packet: DataPacket) {
  return packet.value.value as Extract<DataPacket['value'], { case: 'streamHeader' }>['value'];
}

function chunkOf(packet: DataPacket) {
  return packet.value.value as Extract<DataPacket['value'], { case: 'streamChunk' }>['value'];
}

function trailerOf(packet: DataPacket) {
  return packet.value.value as Extract<DataPacket['value'], { case: 'streamTrailer' }>['value'];
}

describe('OutgoingDataStreamManager', () => {
  describe('v2 -> room of all v1', () => {
    let manager: OutgoingDataStreamManager, sentPackets: Array<DataPacket>;
    beforeEach(() => {
      const result = createManager({
        alice: CLIENT_PROTOCOL_DEFAULT,
        bob: CLIENT_PROTOCOL_DEFAULT,
        jim: CLIENT_PROTOCOL_DATA_STREAM_RPC,
      });
      manager = result.manager;
      sentPackets = result.sentPackets;
    });

    it('should send short TEXT data stream using non single packet "legacy" format and NO compression (happy path)', async () => {
      const info = await manager.sendText('hello world', {
        topic: 'my-topic',
      });

      // Make sure three packets were received, matching the legacy v1 data stream format
      expect(sentPackets).toHaveLength(3);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      const chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(info.id);
      expect(chunk.chunkIndex).toStrictEqual(0n);
      expect(chunk.content).toStrictEqual(new TextEncoder().encode('hello world'));

      expect(sentPackets[2].value.case).toStrictEqual('streamTrailer');
      const trailer = trailerOf(sentPackets[2]);
      expect(trailer.streamId).toStrictEqual(info.id);
      expect(trailer.reason).toStrictEqual('');
    });

    it('should send short BYTE data stream using non single packet "legacy" format and NO compression (happy path)', async () => {
      const writer = await manager.streamBytes({
        topic: 'my-topic',
      });
      await writer.write(new Uint8Array([0x00, 0x01, 0x02, 0x03]));
      await writer.close();

      // Make sure three packets were received, matching the legacy v1 data stream format
      expect(sentPackets).toHaveLength(3);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(writer.info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('byteHeader');

      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      const chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(writer.info.id);
      expect(chunk.chunkIndex).toStrictEqual(0n);
      expect(chunk.content).toStrictEqual(new Uint8Array([0x00, 0x01, 0x02, 0x03]));

      expect(sentPackets[2].value.case).toStrictEqual('streamTrailer');
      const trailer = trailerOf(sentPackets[2]);
      expect(trailer.streamId).toStrictEqual(writer.info.id);
      expect(trailer.reason).toStrictEqual('');
    });

    it('should send long TEXT data stream without compression (happy path)', async () => {
      const longPayload = new Array(40_000).fill('A').join('');
      const info = await manager.sendText(longPayload, {
        topic: 'my-topic',
      });

      // Make sure five packets were received, matching the legacy v1 data stream format
      expect(sentPackets).toHaveLength(5);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      for (let i = 0; i < 3; i += 1) {
        expect(sentPackets[i+1].value.case).toStrictEqual('streamChunk');
        const chunk = chunkOf(sentPackets[i+1]);
        expect(chunk.streamId).toStrictEqual(info.id);
        expect(chunk.chunkIndex).toStrictEqual(BigInt(i));
        expect(chunk.content.every((char) => char === 'A'.charCodeAt(0))).toBeTruthy();
      }

      expect(sentPackets[4].value.case).toStrictEqual('streamTrailer');
      const trailer = trailerOf(sentPackets[4]);
      expect(trailer.streamId).toStrictEqual(info.id);
      expect(trailer.reason).toStrictEqual('');
    });

    it('should send long BYTE data stream without compression (happy path)', async () => {
      const writer = await manager.streamBytes({
        topic: 'my-topic',
      });
      await writer.write(new Uint8Array(20_000).fill(0x01));
      await writer.write(new Uint8Array(20_000).fill(0x01));
      await writer.close();

      // Make sure five packets were received, matching the legacy v1 data stream format
      expect(sentPackets).toHaveLength(6);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(writer.info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('byteHeader');

      // First write generates two packets, 15k long + 5k long
      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      let chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(writer.info.id);
      expect(chunk.chunkIndex).toStrictEqual(0n);
      expect(chunk.content).toHaveLength(15_000); // MTU
      expect(chunk.content.every((byte) => byte === 0x01)).toBeTruthy();

      expect(sentPackets[2].value.case).toStrictEqual('streamChunk');
      chunk = chunkOf(sentPackets[2]);
      expect(chunk.streamId).toStrictEqual(writer.info.id);
      expect(chunk.chunkIndex).toStrictEqual(1n);
      expect(chunk.content).toHaveLength(5_000); // MTU
      expect(chunk.content.every((byte) => byte === 0x01)).toBeTruthy();

      // Second write generates two packets, 15k long + 5k long
      expect(sentPackets[3].value.case).toStrictEqual('streamChunk');
      chunk = chunkOf(sentPackets[3]);
      expect(chunk.streamId).toStrictEqual(writer.info.id);
      expect(chunk.chunkIndex).toStrictEqual(2n);
      expect(chunk.content).toHaveLength(15_000);
      expect(chunk.content.every((byte) => byte === 0x01)).toBeTruthy();

      expect(sentPackets[4].value.case).toStrictEqual('streamChunk');
      chunk = chunkOf(sentPackets[4]);
      expect(chunk.streamId).toStrictEqual(writer.info.id);
      expect(chunk.chunkIndex).toStrictEqual(3n);
      expect(chunk.content).toHaveLength(5_000);
      expect(chunk.content.every((byte) => byte === 0x01)).toBeTruthy();

      expect(sentPackets[5].value.case).toStrictEqual('streamTrailer');
      const trailer = trailerOf(sentPackets[5]);
      expect(trailer.streamId).toStrictEqual(writer.info.id);
      expect(trailer.reason).toStrictEqual('');
    });

    it('should send a FILE via sendFile without compression (happy path)', async () => {
      const bytes = new Uint8Array(20_000).fill(0x07);
      const info = await manager.sendFile(new File([bytes as NonSharedUint8Array], 'text.txt'), {
        topic: 'my-topic',
      });

      // Pre-v2 recipients: uncompressed, multi-packet legacy format.
      // 20k of data -> 15k + 5k chunks. 1 header + 2 chunks + 1 trailer = 4 packets.
      expect(sentPackets).toHaveLength(4);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('byteHeader');
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toBeUndefined();

      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      let chunk = chunkOf(sentPackets[1]);
      expect(chunk.chunkIndex).toStrictEqual(0n);
      expect(chunk.content).toHaveLength(15_000); // MTU
      expect(chunk.content.every((byte) => byte === 0x07)).toBeTruthy();

      expect(sentPackets[2].value.case).toStrictEqual('streamChunk');
      chunk = chunkOf(sentPackets[2]);
      expect(chunk.chunkIndex).toStrictEqual(1n);
      expect(chunk.content).toHaveLength(5_000);
      expect(chunk.content.every((byte) => byte === 0x07)).toBeTruthy();

      expect(sentPackets[3].value.case).toStrictEqual('streamTrailer');
      expect(trailerOf(sentPackets[3]).streamId).toStrictEqual(info.id);
    });
  });
  describe('v2 -> room of all v2', () => {
    let manager: OutgoingDataStreamManager, sentPackets: Array<DataPacket>;
    beforeEach(() => {
      const result = createManager({
        alice: CLIENT_PROTOCOL_DATA_STREAM_V2,
        bob: CLIENT_PROTOCOL_DATA_STREAM_V2,
        noCompression: [CLIENT_PROTOCOL_DATA_STREAM_V2, []],
      });
      manager = result.manager;
      sentPackets = result.sentPackets;
    });

    it('should send short TEXT data stream with single packet and compression (happy path)', async () => {
      const info = await manager.sendText('hello hello compressible world', {
        topic: 'my-topic',
        destinationIdentities: ['alice', 'bob'],
      });

      // Make sure one single packet was used, since data streams v2 + compression is supported
      // across all participants
      expect(sentPackets).toHaveLength(1);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      // Make sure the contents of that packet was compressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toStrictEqual(COMPRESSION_DEFLATE_RAW);
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toBeTypeOf('string');
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).not.toStrictEqual('hello hello compressible world');
    });
    it('should send short TEXT data stream with uncompressible payload in single packet', async () => {
      const info = await manager.sendText('short', {
        topic: 'my-topic',
        destinationIdentities: ['alice', 'bob'],
      });

      // Make sure one single packet was used, since data streams v2 + compression is supported
      // across all participants
      expect(sentPackets).toHaveLength(1);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      // Make sure the contents of that packet was uncompressed - "short" isn't long enough to
      // meaningfully compress with DEFLATE
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toBeUndefined();
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toStrictEqual('short');
    });
    it('should send short data stream with single packet and NO compression if remote participant does not support compression', async () => {
      const info = await manager.sendText('hello hello compressible world', {
        topic: 'my-topic',
        destinationIdentities: ['noCompression'],
      });

      // Make sure one single packet was used, since data streams v2 is supported for that
      // participant.
      expect(sentPackets).toHaveLength(1);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      // Make sure the contents of that packet was NOT compressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toBeUndefined();
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toStrictEqual('hello hello compressible world');
    });
    it('should send long but highly compressible TEXT data stream as single packet', async () => {
      // A phrase which repeats over and over should compress extremely well.
      const text = new Array(20_000).fill('hello world').join('');

      const info = await manager.sendText(text, {
        topic: 'my-topic',
        destinationIdentities: ['alice', 'bob'],
      });

      // Make sure one single packet was used, since data streams v2 is supported and the contents
      // should be able to be highly compressed to be well under the 15k MTU
      expect(sentPackets).toHaveLength(1);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      // Make sure the contents of that packet was compressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toStrictEqual(COMPRESSION_DEFLATE_RAW);
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toBeTypeOf('string');
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]?.startsWith('hello world')).toBeFalsy();
    });
    it('should send long but somewhat compressible data stream as a compressed multi packet data stream', async () => {
      // Mostly incompressible, but the hello world parts repeating should mean that the compressed
      // contents is smaller than the full uncompressed data.
      const text = new Array(50).fill(null).map(() => `hello world${randomText(1_000)}`).join('');

      const info = await manager.sendText(text, {
        topic: 'my-topic',
        destinationIdentities: ['alice', 'bob'],
      });

      // 1 header + 3 data packets + 1 trailer = 5 total packets
      //
      // 3 data packets is less than the Math.ceil(~50k / 15k) = 4 packets that would be
      // required if data was uncompressed
      expect(sentPackets).toHaveLength(5);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      // Make sure the contents of that packet was compressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toStrictEqual(COMPRESSION_DEFLATE_RAW);

      // Verify there are three data packets:
      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      let chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(info.id);
      expect(chunk.chunkIndex).toStrictEqual(0n);
      expect(chunk.content).toHaveLength(15_000); // MTU

      expect(sentPackets[2].value.case).toStrictEqual('streamChunk');
      expect(sentPackets[3].value.case).toStrictEqual('streamChunk');

      // Final packet should be a trailer
      expect(sentPackets[4].value.case).toStrictEqual('streamTrailer');
      const trailer = trailerOf(sentPackets[4]);
      expect(trailer.streamId).toStrictEqual(info.id);
      expect(trailer.reason).toStrictEqual('');
    });
    it('should send long, uncompressible data stream as a compressed multi packet data stream', async () => {
      // This is random data which should be uncompressible
      const bytes = randomBytes(50_000);
      const info = await manager.sendFile(new File([bytes as NonSharedUint8Array], 'text.txt'), {
        topic: 'my-topic',
        destinationIdentities: ['alice', 'bob'],
      });

      // Math.ceil(~50k / 15k) = 4 data packets
      // 1 header + 4 data packets + 1 trailer = 6 total packets
      expect(sentPackets).toHaveLength(6);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('byteHeader');

      // Make sure the contents of that packet was NOT compressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toStrictEqual(COMPRESSION_DEFLATE_RAW);

      // Verify there are four data packets:
      let totalLength = 0;
      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      let chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(info.id);
      expect(chunk.chunkIndex).toStrictEqual(0n);
      expect(chunk.content).toHaveLength(15_000); // MTU
      totalLength += chunk.content.byteLength;

      expect(sentPackets[2].value.case).toStrictEqual('streamChunk');
      chunk = chunkOf(sentPackets[2]);
      totalLength += chunk.content.byteLength;

      expect(sentPackets[3].value.case).toStrictEqual('streamChunk');
      chunk = chunkOf(sentPackets[3]);
      totalLength += chunk.content.byteLength;

      expect(sentPackets[4].value.case).toStrictEqual('streamChunk');
      chunk = chunkOf(sentPackets[4]);
      totalLength += chunk.content.byteLength;

      // Make sure total length is LARGER than the raw bytes length (only slightly, due to the extra
      // DEFLATE metadata being added to an otherwise incompressible binary blob)
      //
      // This is sort of unfortunate that this happens, but the tradeoff to this slight size bump is
      // that the whole binary doesn't have to be buffered into memory all at once.
      expect(totalLength).toBeGreaterThan(bytes.byteLength);

      // Final packet should be a trailer
      expect(sentPackets[5].value.case).toStrictEqual('streamTrailer');
      const trailer = trailerOf(sentPackets[5]);
      expect(trailer.streamId).toStrictEqual(info.id);
      expect(trailer.reason).toStrictEqual('');
    });
    it('should send short data stream with single packet but skip compression due to compress: false being passed', async () => {
      const info = await manager.sendText('hello hello compressible world', {
        topic: 'my-topic',
        destinationIdentities: ['alice', 'bob'],
        compress: false,
      });

      // Make sure one single packet was used, since data streams v2 is supported across all participants
      expect(sentPackets).toHaveLength(1);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      // Make sure the contents of that packet was compressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toBeUndefined();
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toBeTypeOf('string');
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toStrictEqual('hello hello compressible world');
    });
    it('should send long but somewhat compressible data stream but skip compression due to compress: false being passed', async () => {
      // Mostly incompressible, but the hello world parts repeating should mean that the compressed
      // contents is smaller than the full uncompressed data.
      const text = new Array(50).fill(null).map(() => `hello world${randomText(1_000)}`).join('');

      const info = await manager.sendText(text, {
        topic: 'my-topic',
        destinationIdentities: ['alice', 'bob'],
        compress: false,
      });

      // Math.ceil(~50k / 15k) = 4 data packets
      // 1 header + 4 data packets + 1 trailer = 6 total packets
      expect(sentPackets).toHaveLength(6);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      // Make sure the contents of that packet was uncompressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toBeUndefined();

      // Verify there are four data packets:
      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      let chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(info.id);
      expect(chunk.chunkIndex).toStrictEqual(0n);
      expect(chunk.content).toHaveLength(15_000); // MTU

      expect(sentPackets[2].value.case).toStrictEqual('streamChunk');
      expect(sentPackets[3].value.case).toStrictEqual('streamChunk');
      expect(sentPackets[4].value.case).toStrictEqual('streamChunk');

      // Final packet should be a trailer
      expect(sentPackets[5].value.case).toStrictEqual('streamTrailer');
      const trailer = trailerOf(sentPackets[5]);
      expect(trailer.streamId).toStrictEqual(info.id);
      expect(trailer.reason).toStrictEqual('');
    });

    it('should NEVER use compression or single packet data streams with streamText', async () => {
      const writer = await manager.streamText({
        topic: 'my-topic',
        destinationIdentities: ['noCompression'],
      });

      // Make sure the header packet was sent
      expect(sentPackets).toHaveLength(1);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(writer.info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toBeUndefined(); // Make sure compression is disabled

      await writer.write('hello world');

      // Make sure a single chunk packet was emitted
      expect(sentPackets).toHaveLength(2 /* 1 header + 1 chunk */);

      expect(sentPackets[1].value.case).toBe('streamChunk');
      const chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(writer.info.id);
      expect(chunk.content).toStrictEqual(new TextEncoder().encode('hello world'));

      await writer.close();

      // Finally, verify the trailer
      expect(sentPackets).toHaveLength(3 /* 1 header + 1 chunk + 1 trailer */);
      expect(sentPackets[2].value.case).toBe('streamTrailer');
    });
    it('should NEVER use compression or single packet data streams with streamBytes', async () => {
      const writer = await manager.streamBytes({
        topic: 'my-topic',
        destinationIdentities: ['noCompression'],
      });

      // Make sure the header packet was sent
      expect(sentPackets).toHaveLength(1);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(writer.info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('byteHeader');
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toBeUndefined(); // Make sure compression is disabled

      await writer.write(new Uint8Array([0x00, 0x01, 0x02, 0x03]));

      // Make sure a single chunk packet was emitted
      expect(sentPackets).toHaveLength(2 /* 1 header + 1 chunk */);

      expect(sentPackets[1].value.case).toBe('streamChunk');
      const chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(writer.info.id);
      expect(chunk.content).toStrictEqual(new Uint8Array([0x00, 0x01, 0x02, 0x03]));

      await writer.close();

      // Finally, verify the trailer
      expect(sentPackets).toHaveLength(3 /* 1 header + 1 chunk + 1 trailer */);
      expect(sentPackets[2].value.case).toBe('streamTrailer');
    });

    it('should NOT send bytes single packet with sendFile', async () => {
      // This is random data which should be uncompressible
      const bytes = new Uint8Array(10_000).fill(0x01);
      const info = await manager.sendFile(new File([bytes as NonSharedUint8Array], 'text.txt'), {
        topic: 'my-topic',
        destinationIdentities: ['alice', 'bob'],
      });

      // Should be a multi-packet result
      // 
      // Sending single packet data streams for files is tricky because it's really difficult to
      // determine ahead of time if a file can fit into a single packet without a ton of ahead of
      // time in memory buffering.
      expect(sentPackets).toHaveLength(3);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('byteHeader');

      // Make sure the contents of that packet was NOT compressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toStrictEqual(COMPRESSION_DEFLATE_RAW);

      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      let chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(info.id);
      expect(chunk.chunkIndex).toStrictEqual(0n);

      // Make sure contents were compressed
      expect(chunk.content.byteLength).toBeLessThan(bytes.byteLength);

      // Final packet should be a trailer
      expect(sentPackets[2].value.case).toStrictEqual('streamTrailer');
      const trailer = trailerOf(sentPackets[2]);
      expect(trailer.streamId).toStrictEqual(info.id);
      expect(trailer.reason).toStrictEqual('');
    });

    it('should send a FILE via sendFile WITHOUT compression if remote does not support compression', async () => {
      const bytes = new Uint8Array(10_000).fill(0x07);
      const info = await manager.sendFile(new File([bytes as NonSharedUint8Array], 'text.txt'), {
        topic: 'my-topic',
        destinationIdentities: ['noCompression'],
      });

      // v2 recipient but no deflate-raw capability: uncompressed, multi-packet (never inline).
      expect(sentPackets).toHaveLength(3);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.contentHeader.case).toBe('byteHeader');
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toBeUndefined();
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toBeUndefined();

      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      const chunk = chunkOf(sentPackets[1]);
      expect(chunk.chunkIndex).toStrictEqual(0n);
      expect(chunk.content).toHaveLength(10_000); // uncompressed, single chunk under the MTU
      expect(chunk.content.every((byte) => byte === 0x07)).toBeTruthy();

      expect(sentPackets[2].value.case).toStrictEqual('streamTrailer');
      expect(trailerOf(sentPackets[2]).streamId).toStrictEqual(info.id);
    });

    it('should send an empty FILE via sendFile', async () => {
      const info = await manager.sendFile(new File([], 'empty.bin'), {
        topic: 'my-topic',
        destinationIdentities: ['alice', 'bob'],
      });

      // An empty file still produces a well-formed compressed byte stream: a header declaring zero
      // length, the deflate stream's final block, and a trailer.
      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.contentHeader.case).toBe('byteHeader');
      expect(header.totalLength).toStrictEqual(0n);
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toStrictEqual(COMPRESSION_DEFLATE_RAW);

      const last = sentPackets[sentPackets.length - 1];
      expect(last.value.case).toStrictEqual('streamTrailer');
      expect(trailerOf(last).streamId).toStrictEqual(info.id);
    });
  });
  describe('v2 -> room of mixed v1 / v2', () => {
    let manager: OutgoingDataStreamManager, sentPackets: Array<DataPacket>;
    beforeEach(() => {
      const result = createManager({
        alice: CLIENT_PROTOCOL_DEFAULT,
        bob: CLIENT_PROTOCOL_DATA_STREAM_V2,
        jim: CLIENT_PROTOCOL_DATA_STREAM_V2,
        mallory: CLIENT_PROTOCOL_DATA_STREAM_RPC,
        noCompression: [CLIENT_PROTOCOL_DATA_STREAM_V2, []],
      });
      manager = result.manager;
      sentPackets = result.sentPackets;
    });

    it('should send data stream using v1 legacy data stream format in room of mixed v1/v2', async () => {
      const info = await manager.sendText('hello world', {
        topic: 'my-topic',
      });

      // Make sure three packets were received, matching the legacy v1 data stream format
      expect(sentPackets).toHaveLength(3);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      expect(sentPackets[1].value.case).toStrictEqual('streamChunk');
      const chunk = chunkOf(sentPackets[1]);
      expect(chunk.streamId).toStrictEqual(info.id);
      expect(chunk.chunkIndex).toStrictEqual(0n);
      expect(chunk.content).toStrictEqual(new TextEncoder().encode('hello world'));

      expect(sentPackets[2].value.case).toStrictEqual('streamTrailer');
      const trailer = trailerOf(sentPackets[2]);
      expect(trailer.streamId).toStrictEqual(info.id);
      expect(trailer.reason).toStrictEqual('');
    });
    it('should send data stream using data stream v2 format + compression when only sending to a subset of participants that are all v2', async () => {
      const info = await manager.sendText('hello hello compressible world', {
        topic: 'my-topic',
        destinationIdentities: ['bob', 'jim'],
      });

      // Make sure one single packet was used, since data streams v2 + compression is supported
      // across bob + jim
      expect(sentPackets).toHaveLength(1);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      // Make sure the contents of that packet was compressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toStrictEqual(COMPRESSION_DEFLATE_RAW);
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toBeTypeOf('string');
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).not.toStrictEqual('hello hello compressible world');
    });
    it('should send data stream using data stream v2 format but NO compression when only sending to a subset of participants where one does NOT support compression', async () => {
      const info = await manager.sendText('hello hello compressible world', {
        topic: 'my-topic',
        destinationIdentities: ['bob', 'jim', 'noCompression'],
      });

      // Make sure one single packet was used, since data streams v2 + compression is supported
      // across bob + jim
      expect(sentPackets).toHaveLength(1);

      expect(sentPackets[0].value.case).toBe('streamHeader');
      const header = headerOf(sentPackets[0]);
      expect(header.streamId).toStrictEqual(info.id);
      expect(header.topic).toStrictEqual('my-topic');
      expect(header.contentHeader.case).toBe('textHeader');

      // Make sure the contents of that packet was compressed
      expect(header.attributes?.[COMPRESSION_ATTRIBUTE]).toBeUndefined();
      expect(header.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toStrictEqual('hello hello compressible world');
    });
  });
});
