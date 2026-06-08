import {
  DataPacket,
  DataStream_ByteHeader,
  DataStream_Header,
  DataStream_TextHeader,
  Encryption_Type,
} from '@livekit/protocol';
import { describe, expect, it } from 'vitest';
import { encodeBase64 } from '../../utils';
import { INLINE_PAYLOAD_ATTRIBUTE } from '../constants';
import IncomingDataStreamManager from './IncomingDataStreamManager';
import type { ByteStreamReader, TextStreamReader } from './StreamReader';

function inlineTextHeaderPacket(streamId: string, topic: string, text: string) {
  const header = new DataStream_Header({
    streamId,
    topic,
    mimeType: 'text/plain',
    timestamp: 0n,
    totalLength: BigInt(new TextEncoder().encode(text).byteLength),
    attributes: { [INLINE_PAYLOAD_ATTRIBUTE]: text, foo: 'bar' },
    contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
  });
  return new DataPacket({
    participantIdentity: 'alice',
    value: { case: 'streamHeader', value: header },
  });
}

function inlineByteHeaderPacket(streamId: string, topic: string, bytes: Uint8Array) {
  const header = new DataStream_Header({
    streamId,
    topic,
    mimeType: 'application/octet-stream',
    timestamp: 0n,
    totalLength: BigInt(bytes.byteLength),
    attributes: { [INLINE_PAYLOAD_ATTRIBUTE]: encodeBase64(bytes), foo: 'bar' },
    contentHeader: { case: 'byteHeader', value: new DataStream_ByteHeader({ name: 'blob' }) },
  });
  return new DataPacket({
    participantIdentity: 'alice',
    value: { case: 'streamHeader', value: header },
  });
}

describe('IncomingDataStreamManager inline streams', () => {
  it('synthesizes a complete text stream from an inline header', async () => {
    const manager = new IncomingDataStreamManager();
    manager.setConnected(true);

    const readerPromise = new Promise<TextStreamReader>((resolve) => {
      manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
    });

    manager.handleDataStreamPacket(
      inlineTextHeaderPacket('stream-1', 'my-topic', 'hello world'),
      Encryption_Type.NONE,
    );

    const reader = await readerPromise;
    expect(await reader.readAll()).toBe('hello world');

    // The reserved attribute is stripped, user attributes are preserved.
    expect(reader.info.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toBeUndefined();
    expect(reader.info.attributes?.foo).toBe('bar');
  });

  it('synthesizes a complete byte stream from an inline header', async () => {
    const manager = new IncomingDataStreamManager();
    manager.setConnected(true);

    const payload = new Uint8Array([0, 1, 2, 255, 128, 64]);

    const readerPromise = new Promise<ByteStreamReader>((resolve) => {
      manager.registerByteStreamHandler('bytes-topic', (reader) => resolve(reader));
    });

    manager.handleDataStreamPacket(
      inlineByteHeaderPacket('stream-2', 'bytes-topic', payload),
      Encryption_Type.NONE,
    );

    const reader = await readerPromise;
    const chunks = await reader.readAll();
    const flattened = new Uint8Array(chunks.reduce((acc, c) => acc + c.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) {
      flattened.set(chunk, offset);
      offset += chunk.byteLength;
    }
    expect(Array.from(flattened)).toEqual(Array.from(payload));
    expect(reader.info.attributes?.[INLINE_PAYLOAD_ATTRIBUTE]).toBeUndefined();
    expect(reader.info.attributes?.foo).toBe('bar');
  });
});
