import { type DataPacket, Encryption_Type } from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';
import log from '../../logger';
import { CLIENT_PROTOCOL_DATA_STREAM_RPC, CLIENT_PROTOCOL_DATA_STREAM_V2 } from '../../version';
import type RTCEngine from '../RTCEngine';
import IncomingDataStreamManager from './incoming/IncomingDataStreamManager';
import type { ByteStreamReader, TextStreamReader } from './incoming/StreamReader';
import OutgoingDataStreamManager from './outgoing/OutgoingDataStreamManager';

const RECEIVER = 'bob';
const hasCompression = typeof CompressionStream !== 'undefined';

/** An OutgoingDataStreamManager whose engine captures every sent packet. */
function createSender(recipientProtocol = CLIENT_PROTOCOL_DATA_STREAM_V2) {
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
    () => recipientProtocol,
    () => [RECEIVER],
  );
  return { manager, sentPackets };
}

/** Replays captured outgoing packets into a receiver and returns the resulting text. */
async function receiveText(packets: DataPacket[], topic: string): Promise<TextStreamReader> {
  const incoming = new IncomingDataStreamManager();
  incoming.setConnected(true);
  const readerPromise = new Promise<TextStreamReader>((resolve) => {
    incoming.registerTextStreamHandler(topic, (reader) => resolve(reader));
  });
  for (const packet of packets) {
    incoming.handleDataStreamPacket(packet, Encryption_Type.NONE);
  }
  return readerPromise;
}

async function receiveBytes(packets: DataPacket[], topic: string): Promise<ByteStreamReader> {
  const incoming = new IncomingDataStreamManager();
  incoming.setConnected(true);
  const readerPromise = new Promise<ByteStreamReader>((resolve) => {
    incoming.registerByteStreamHandler(topic, (reader) => resolve(reader));
  });
  for (const packet of packets) {
    incoming.handleDataStreamPacket(packet, Encryption_Type.NONE);
  }
  return readerPromise;
}

function flatten(chunks: Array<Uint8Array>): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

describe.skipIf(!hasCompression)('data stream compression round-trip', () => {
  it('round-trips a small compressible inline text payload', async () => {
    const { manager, sentPackets } = createSender();
    const payload = 'compress me '.repeat(50); // > raw, compresses well, fits inline

    await manager.sendText(payload, { topic: 't', destinationIdentities: [RECEIVER] });

    expect(sentPackets).toHaveLength(1); // single inline header packet
    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe(payload);
  });

  it('round-trips a large chunked compressed text payload (multi-packet)', async () => {
    const { manager, sentPackets } = createSender();
    // High entropy → too big to inline even compressed → chunked + compressed.
    let payload = '';
    while (payload.length < 60_000) {
      payload += Math.random().toString(36).slice(2);
    }

    await manager.sendText(payload, { topic: 't', destinationIdentities: [RECEIVER] });

    expect(sentPackets.some((p) => p.value.case === 'streamChunk')).toBe(true);
    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe(payload);
  });

  it('round-trips chunked compressed text with multibyte UTF-8 (reframing on char boundaries)', async () => {
    const { manager, sentPackets } = createSender();
    // Emoji + CJK so gzip/output chunk boundaries fall mid-character.
    const payload = '日本語🚀テスト '.repeat(4_000);

    const writer = await manager.streamText({ topic: 't', destinationIdentities: [RECEIVER] });
    await writer.write(payload);
    await writer.close();

    expect(sentPackets.some((p) => p.value.case === 'streamChunk')).toBe(true);
    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe(payload);
  });

  it('round-trips a chunked compressed byte stream', async () => {
    const { manager, sentPackets } = createSender();
    const payload = new Uint8Array(50_000);
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] = i % 256;
    }

    const writer = await manager.streamBytes({ topic: 'b', destinationIdentities: [RECEIVER] });
    await writer.write(payload);
    await writer.close();

    expect(sentPackets.some((p) => p.value.case === 'streamChunk')).toBe(true);
    const reader = await receiveBytes(sentPackets, 'b');
    expect(Array.from(flatten(await reader.readAll()))).toEqual(Array.from(payload));
  });

  it('round-trips text written across multiple writes (multi-member gzip)', async () => {
    const { manager, sentPackets } = createSender();
    const parts = ['first part ', '日本語🚀 second ', 'x'.repeat(20_000), ' tail'];

    const writer = await manager.streamText({ topic: 't', destinationIdentities: [RECEIVER] });
    for (const part of parts) {
      await writer.write(part);
    }
    await writer.close();

    expect(sentPackets.some((p) => p.value.case === 'streamChunk')).toBe(true);
    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe(parts.join(''));
  });

  it('round-trips bytes written across multiple writes (multi-member gzip)', async () => {
    const { manager, sentPackets } = createSender();
    const parts = [
      new Uint8Array([1, 2, 3]),
      new Uint8Array(20_000).fill(7),
      new Uint8Array([9, 8, 7, 6]),
    ];
    const expected = parts.flatMap((p) => Array.from(p));

    const writer = await manager.streamBytes({ topic: 'b', destinationIdentities: [RECEIVER] });
    for (const part of parts) {
      await writer.write(part);
    }
    await writer.close();

    const reader = await receiveBytes(sentPackets, 'b');
    expect(Array.from(flatten(await reader.readAll()))).toEqual(expected);
  });

  it('does not compress for a pre-v2 recipient (uncompressed round-trip)', async () => {
    const { manager, sentPackets } = createSender(CLIENT_PROTOCOL_DATA_STREAM_RPC);
    const payload = 'plain text '.repeat(2_000);

    const writer = await manager.streamText({ topic: 't', destinationIdentities: [RECEIVER] });
    await writer.write(payload);
    await writer.close();

    // No compression attribute on the header.
    const header = sentPackets.find((p) => p.value.case === 'streamHeader');
    const headerValue = header!.value.value as Extract<
      DataPacket['value'],
      { case: 'streamHeader' }
    >['value'];
    expect(headerValue.attributes['lk.compression']).toBeUndefined();

    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe(payload);
  });
});
