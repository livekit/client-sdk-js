import { type DataPacket, type DataStream_Chunk, Encryption_Type } from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';
import log from '../../logger';
import { CLIENT_PROTOCOL_DATA_STREAM_RPC, CLIENT_PROTOCOL_DATA_STREAM_V2 } from '../../version';
import type RTCEngine from '../RTCEngine';
import IncomingDataStreamManager from './incoming/IncomingDataStreamManager';
import type { ByteStreamReader, TextStreamReader } from './incoming/StreamReader';
import OutgoingDataStreamManager from './outgoing/OutgoingDataStreamManager';

const RECEIVER = 'bob';
const hasCompression = typeof CompressionStream !== 'undefined';

/** High-entropy text: too big to inline even after compression, forcing the chunked fallback. */
function randomText(length: number): string {
  let s = '';
  while (s.length < length) {
    s += Math.random().toString(36).slice(2);
  }
  return s.slice(0, length);
}

/** High-entropy multibyte text (random CJK), so compressed output chunk boundaries fall
 *  mid-character and the payload stays over the inline budget even compressed. */
function randomMultibyteText(chars: number): string {
  let s = '';
  for (let i = 0; i < chars; i += 1) {
    s += String.fromCharCode(0x4e00 + Math.floor(Math.random() * 0x51a5));
  }
  return s;
}

/** Total streamChunk content bytes across the captured packets. */
function chunkContentBytes(packets: DataPacket[]): number {
  return packets
    .filter((p) => p.value.case === 'streamChunk')
    .reduce((sum, p) => sum + (p.value.value as DataStream_Chunk).content.byteLength, 0);
}

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
    const payload = randomText(60_000);

    await manager.sendText(payload, { topic: 't', destinationIdentities: [RECEIVER] });

    expect(sentPackets.some((p) => p.value.case === 'streamChunk')).toBe(true);
    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe(payload);
  });

  it('round-trips chunked compressed text with multibyte UTF-8 (reframing on char boundaries)', async () => {
    const { manager, sentPackets } = createSender();
    // High-entropy CJK so compressed output chunk boundaries fall mid-character.
    const payload = randomMultibyteText(30_000);

    await manager.sendText(payload, { topic: 't', destinationIdentities: [RECEIVER] });

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

  it('round-trips text written across multiple writes (uncompressed streamText)', async () => {
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

  it('marks the chunked compressed sendText fallback with the deflate-raw attribute', async () => {
    const { manager, sentPackets } = createSender();

    await manager.sendText(randomText(60_000), { topic: 't', destinationIdentities: [RECEIVER] });

    const header = sentPackets.find((p) => p.value.case === 'streamHeader');
    const headerValue = header!.value.value as Extract<
      DataPacket['value'],
      { case: 'streamHeader' }
    >['value'];
    expect(headerValue.attributes['lk.compression']).toBe('deflate-raw');
    // Chunk packets carry no smuggled metadata.
    for (const packet of sentPackets) {
      if (packet.value.case === 'streamChunk') {
        expect(packet.value.value.iv).toBeUndefined();
        expect(packet.value.value.version).toBe(0);
      }
    }
  });

  it('emits each write to the receiver as its packets arrive, before the stream ends', async () => {
    const { manager, sentPackets } = createSender();
    const incoming = new IncomingDataStreamManager();
    incoming.setConnected(true);
    const readerPromise = new Promise<TextStreamReader>((resolve) => {
      incoming.registerTextStreamHandler('t', (reader) => resolve(reader));
    });

    const writer = await manager.streamText({ topic: 't', destinationIdentities: [RECEIVER] });
    let fed = 0;
    const feedNewPackets = () => {
      for (const packet of sentPackets.slice(fed)) {
        incoming.handleDataStreamPacket(packet, Encryption_Type.NONE);
      }
      fed = sentPackets.length;
    };

    const writes = ['first write ', 'second write, repeating first write words ', 'third'];
    let iterator: AsyncIterator<string> | undefined;
    for (const write of writes) {
      await writer.write(write);
      feedNewPackets();
      if (!iterator) {
        const reader = await readerPromise;
        iterator = reader[Symbol.asyncIterator]();
      }
      // The write's full text must be readable now - no trailer has been sent yet.
      let got = '';
      while (got.length < write.length) {
        const { done, value } = await iterator.next();
        expect(done).toBeFalsy();
        got += value;
      }
      expect(got).toBe(write);
    }

    await writer.close();
    feedNewPackets();
    const end = await iterator!.next();
    expect(end.done).toBe(true);
  });

  it('ignores a duplicated chunk packet with a warning', async () => {
    const { manager, sentPackets } = createSender();
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {});

    try {
      // Compressed chunked fallback: the stateful inflater is what needs dup protection.
      const payload = randomText(60_000);
      await manager.sendText(payload, { topic: 't', destinationIdentities: [RECEIVER] });

      // Replay the first chunk packet again right after the original.
      const firstChunkIdx = sentPackets.findIndex((p) => p.value.case === 'streamChunk');
      const packets = [...sentPackets];
      packets.splice(firstChunkIdx + 1, 0, packets[firstChunkIdx]);

      const reader = await receiveText(packets, 't');
      expect(await reader.readAll()).toBe(payload);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('duplicate chunk'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('errors the stream when a chunk goes missing (gap in chunk indices)', async () => {
    const { manager, sentPackets } = createSender();

    // Compressed chunked fallback: the stateful inflater cannot tolerate gaps.
    await manager.sendText(randomText(60_000), { topic: 't', destinationIdentities: [RECEIVER] });

    // Drop the first chunk packet entirely.
    const firstChunkIdx = sentPackets.findIndex((p) => p.value.case === 'streamChunk');
    const packets = sentPackets.filter((_, i) => i !== firstChunkIdx);

    const reader = await receiveText(packets, 't');
    await expect(reader.readAll()).rejects.toThrow(/[Mm]issing chunk/);
  });

  it('sends a long stream of many small writes uncompressed (transcription pattern)', async () => {
    const { manager, sentPackets } = createSender();
    const writes = Array.from(
      { length: 500 },
      (_, i) => `transcription segment number ${i} with some repeated filler words. `,
    );

    const writer = await manager.streamText({ topic: 't', destinationIdentities: [RECEIVER] });
    for (const write of writes) {
      await writer.write(write);
    }
    await writer.close();

    const expected = writes.join('');
    // streamText never compresses: the chunk contents are exactly the payload bytes.
    expect(chunkContentBytes(sentPackets)).toBe(new TextEncoder().encode(expected).byteLength);

    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe(expected);
  });

  it('streamText never compresses, even for v2 recipients', async () => {
    const { manager, sentPackets } = createSender();

    const writer = await manager.streamText({ topic: 't', destinationIdentities: [RECEIVER] });
    await writer.write('one ');
    await writer.write('two');
    await writer.close();

    // No compression attribute on the header, and chunk contents are plain UTF-8.
    const header = sentPackets.find((p) => p.value.case === 'streamHeader');
    const headerValue = header!.value.value as Extract<
      DataPacket['value'],
      { case: 'streamHeader' }
    >['value'];
    expect(headerValue.attributes['lk.compression']).toBeUndefined();
    const contents = sentPackets
      .filter((p) => p.value.case === 'streamChunk')
      .map((p) => new TextDecoder().decode((p.value.value as DataStream_Chunk).content));
    expect(contents.join('')).toBe('one two');

    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe('one two');
  });

  it('actually shrinks a compressible chunked sendText payload on the wire', async () => {
    const { manager, sentPackets } = createSender();
    // Moderately compressible (small vocabulary) but high enough entropy that the compressed
    // output still exceeds the inline budget → chunked fallback with real compression win.
    const vocabulary = randomText(2_000).match(/.{1,8}/g)!;
    let payload = '';
    while (payload.length < 200_000) {
      payload += vocabulary[Math.floor(Math.random() * vocabulary.length)] + ' ';
    }

    await manager.sendText(payload, { topic: 't', destinationIdentities: [RECEIVER] });

    expect(sentPackets.some((p) => p.value.case === 'streamChunk')).toBe(true);
    expect(chunkContentBytes(sentPackets)).toBeLessThan(payload.length / 2);

    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe(payload);
  });

  it('round-trips a streamText stream closed without any writes', async () => {
    const { manager, sentPackets } = createSender();

    const writer = await manager.streamText({ topic: 't', destinationIdentities: [RECEIVER] });
    await writer.close();

    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe('');
  });

  it('does not compress sendText for a pre-v2 recipient (uncompressed round-trip)', async () => {
    const { manager, sentPackets } = createSender(CLIENT_PROTOCOL_DATA_STREAM_RPC);
    const payload = 'plain text '.repeat(2_000);

    await manager.sendText(payload, { topic: 't', destinationIdentities: [RECEIVER] });

    // No compression attribute on the header, and the payload went out as raw bytes.
    const header = sentPackets.find((p) => p.value.case === 'streamHeader');
    const headerValue = header!.value.value as Extract<
      DataPacket['value'],
      { case: 'streamHeader' }
    >['value'];
    expect(headerValue.attributes['lk.compression']).toBeUndefined();
    expect(chunkContentBytes(sentPackets)).toBe(new TextEncoder().encode(payload).byteLength);

    const reader = await receiveText(sentPackets, 't');
    expect(await reader.readAll()).toBe(payload);
  });
});
