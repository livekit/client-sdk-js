import {
  DataPacket,
  DataStream_ByteHeader,
  DataStream_Chunk,
  DataStream_CompressionType,
  DataStream_Header,
  DataStream_TextHeader,
  DataStream_Trailer,
  Encryption_Type,
} from '@livekit/protocol';
import { describe, expect, it } from 'vitest';
import { deflateRawCompress } from '../compression';
import { STREAM_CHUNK_SIZE_BYTES } from '../constants';
import IncomingDataStreamManager from './IncomingDataStreamManager';
import type { ByteStreamReader, TextStreamReader } from './StreamReader';

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

type HeaderFields = NonNullable<ConstructorParameters<typeof DataStream_Header>[0]>;

/** Wraps a `DataStream_Header` (from `alice`, topic `my-topic`) in a `DataPacket`. */
function headerPacket(
  streamId: string,
  contentCase: 'textHeader' | 'byteHeader',
  fields: HeaderFields = {},
): DataPacket {
  return new DataPacket({
    participantIdentity: 'alice',
    value: {
      case: 'streamHeader',
      value: new DataStream_Header({
        streamId,
        topic: 'my-topic',
        mimeType: 'text/plain',
        timestamp: 0n,
        contentHeader:
          contentCase === 'textHeader'
            ? { case: 'textHeader', value: new DataStream_TextHeader({}) }
            : { case: 'byteHeader', value: new DataStream_ByteHeader({}) },
        ...fields,
      }),
    },
  });
}

/** Wraps a `DataStream_Chunk` in a `DataPacket`. */
function chunkPacket(
  streamId: string,
  chunkIndex: number,
  content: Uint8Array,
  version = 0,
): DataPacket {
  return new DataPacket({
    participantIdentity: 'alice',
    value: {
      case: 'streamChunk',
      value: new DataStream_Chunk({
        streamId,
        chunkIndex: BigInt(chunkIndex),
        content,
        version,
      }),
    },
  });
}

/** Wraps a `DataStream_Trailer` in a `DataPacket`. */
function trailerPacket(
  streamId: string,
  attributes?: Record<string, string>,
  reason?: string,
): DataPacket {
  return new DataPacket({
    participantIdentity: 'alice',
    value: {
      case: 'streamTrailer',
      value: new DataStream_Trailer({ streamId, attributes, reason }),
    },
  });
}

/** Concatenates the byte chunks a `ByteStreamReader.readAll()` resolves with. */
function concatChunks(chunks: Array<Uint8Array>): Uint8Array {
  const out = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

describe('IncomingDataStreamManager', () => {
  describe('Receiving v1 data streams', () => {
    it('should receive a v1 text data stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: BigInt(text.length),
              attributes: { foo: 'bar' },
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 0n,
              content: new TextEncoder().encode(text),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamTrailer',
            value: new DataStream_Trailer({ streamId }),
          },
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual('hello world');
      expect(reader.info.attributes?.foo).toStrictEqual('bar');
    });

    it('should receive a v1 bytes data stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<ByteStreamReader>((resolve) => {
        manager.registerByteStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();

      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: 4n,
              attributes: { foo: 'bar' },
              contentHeader: { case: 'byteHeader', value: new DataStream_ByteHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 0n,
              content: new Uint8Array([0x01, 0x02, 0x03, 0x04]),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamTrailer',
            value: new DataStream_Trailer({ streamId }),
          },
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual([new Uint8Array([0x01, 0x02, 0x03, 0x04])]);
      expect(reader.info.attributes?.foo).toStrictEqual('bar');
    });

    it('should receive a v1 text data stream with files', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const streamId = crypto.randomUUID();
      const streamReaderPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const attachmentStreamId = crypto.randomUUID();
      const attachmentStreamReaderPromise = new Promise<ByteStreamReader>((resolve) => {
        manager.registerByteStreamHandler('my-topic', (reader) => resolve(reader));
      });

      // Send the main data stream body
      const text = 'hello world';
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: BigInt(text.length),
              attributes: { foo: 'bar' },
              inlineContent: new TextEncoder().encode(text),
              contentHeader: {
                case: 'textHeader',
                value: new DataStream_TextHeader({
                  attachedStreamIds: [attachmentStreamId],
                }),
              },
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      // Send an attachment
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId: attachmentStreamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: 3n,
              attributes: {},
              contentHeader: { case: 'byteHeader', value: new DataStream_ByteHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId: attachmentStreamId,
              chunkIndex: 0n,
              content: new Uint8Array([0x01, 0x02, 0x03]),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamTrailer',
            value: new DataStream_Trailer({ streamId: attachmentStreamId }),
          },
        }),
        Encryption_Type.NONE,
      );

      const streamReader = await streamReaderPromise;
      expect(await streamReader.readAll()).toStrictEqual('hello world');
      expect(streamReader.info.attachedStreamIds).toHaveLength(1);

      const attachmentStreamReader = await attachmentStreamReaderPromise;
      expect(await attachmentStreamReader.readAll()).toStrictEqual([
        new Uint8Array([0x01, 0x02, 0x03]),
      ]);
      expect(streamReader.info.attachedStreamIds).toHaveLength(1);
    });

    it('should buffer packets when disconnected', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(false);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      // Send three packets
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: BigInt(text.length),
              attributes: { foo: 'bar' },
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 0n,
              content: new TextEncoder().encode(text),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamTrailer',
            value: new DataStream_Trailer({ streamId }),
          },
        }),
        Encryption_Type.NONE,
      );

      // Make sure promise still hasn't resolved
      await expect(
        Promise.race([readerPromise, Promise.resolve('still pending')]),
      ).resolves.toStrictEqual('still pending');

      // Simulate connecting
      manager.setConnected(true);

      // Make sure it resolves after connected state set
      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual('hello world');
    });

    it('should merge in trailer attributes', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      // Send three packets
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: BigInt(text.length),
              attributes: { foo: 'bar', baz: 'quux' },
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 0n,
              content: new TextEncoder().encode(text),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamTrailer',
            value: new DataStream_Trailer({
              streamId,
              attributes: { hello: 'world', foo: 'updated' },
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      // Make sure it resolves after connected state set
      const reader = await readerPromise;
      expect(reader.info.attributes?.baz).toStrictEqual('quux');
      expect(reader.info.attributes?.hello).toStrictEqual('world');
      expect(reader.info.attributes?.foo).toStrictEqual('updated');
    });

    it('should drop packets with incorrect EncryptionType', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      // Send two packets, the second with an incorrect encryption value
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: BigInt(text.length),
              attributes: { foo: 'bar', baz: 'quux' },
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 0n,
              content: new TextEncoder().encode(text),
              version: 0,
            }),
          },
        }),
        Encryption_Type.GCM, // <-- NOTE: this has changed since the last packet
      );

      // Make sure an error is thrown from the reader
      const reader = await readerPromise;
      expect(() => reader.readAll()).rejects.toThrow('Encryption type mismatch');
    });

    it('should throw an error if data stream does not have enough packets', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();

      // Send a header, a 1 byte long chunk, and a trailer
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: 5n,
              attributes: { foo: 'bar', baz: 'quux' },
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 0n,
              content: new Uint8Array([0x01]),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamTrailer',
            value: new DataStream_Trailer({ streamId }),
          },
        }),
        Encryption_Type.NONE,
      );

      // Make sure an error is thrown from the reader
      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow('Not enough chunk(s)');
    });

    it('should throw an error if data stream has too many bytes', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();

      // Send a header declaring 3 bytes, then a 5 byte long chunk, and a trailer
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: 3n,
              attributes: { foo: 'bar', baz: 'quux' },
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 0n,
              content: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      // Make sure an error is thrown from the reader
      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow('Extra chunk(s)');
    });

    it('should throw an error if participant disconnects while data stream is still not fully received', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();

      // Send a header declaring 10 bytes, then a 5 byte long chunk
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: 10n,
              attributes: { foo: 'bar', baz: 'quux' },
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 0n,
              content: new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      // Simulate a remote participant disconnect, which calls this method in the room handler
      manager.validateParticipantHasNoActiveDataStreams('alice');

      // Make sure an error is thrown from the reader
      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow(
        'Participant alice unexpectedly disconnected in the middle of sending data',
      );
    });
  });

  describe('Receiving v2 data streams', () => {
    it('should receive a v2 SINGLE PACKET + UNCOMPRESSED text data stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: BigInt(text.length),
              attributes: { foo: 'bar' },
              inlineContent: new TextEncoder().encode(text),
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual('hello world');
      expect(reader.info.attributes?.foo).toStrictEqual('bar');
    });

    it('should receive a v2 SINGLE PACKET + UNCOMPRESSED byte data stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<ByteStreamReader>((resolve) => {
        manager.registerByteStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const bytes = new Uint8Array([0x01, 0x02, 0x03]);

      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: 3n,
              inlineContent: bytes,
              contentHeader: { case: 'byteHeader', value: new DataStream_ByteHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual([new Uint8Array([0x01, 0x02, 0x03])]);
    });

    it('should receive a v2 SINGLE PACKET + COMPRESSED text data stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';
      const compressed = await deflateRawCompress(new TextEncoder().encode(text));

      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: BigInt(text.length),
              attributes: { foo: 'bar' },
              compression: DataStream_CompressionType.DEFLATE_RAW,
              inlineContent: compressed,
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual('hello world');
      expect(reader.info.attributes?.foo).toStrictEqual('bar');
    });

    it('should receive a v2 SINGLE PACKET + COMPRESSED byte data stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<ByteStreamReader>((resolve) => {
        manager.registerByteStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const bytes = new Uint8Array([0x01, 0x02, 0x03]);
      const compressed = await deflateRawCompress(bytes);

      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: BigInt(bytes.length),
              compression: DataStream_CompressionType.DEFLATE_RAW,
              inlineContent: compressed,
              contentHeader: { case: 'byteHeader', value: new DataStream_ByteHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual([new Uint8Array([0x01, 0x02, 0x03])]);
    });

    it('should receive a v2 MULTI PACKET + COMPRESSED text data stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();

      // NOTE: mostly incompressible, but the hello world parts repeating should mean that the compressed
      // contents is smaller than the full uncompressed data.
      const text = new Array(30)
        .fill(null)
        .map(() => `hello world${randomText(1_000)}`)
        .join('');

      const compressed = await deflateRawCompress(new TextEncoder().encode(text));

      // Make sure the compressed text should be able to be split into two "packets" worth of data
      expect(compressed.length).toBeLessThan(2 * STREAM_CHUNK_SIZE_BYTES);

      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: BigInt(text.length),
              compression: DataStream_CompressionType.DEFLATE_RAW,
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 0n,
              content: compressed.slice(0, STREAM_CHUNK_SIZE_BYTES),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              streamId,
              chunkIndex: 1n,
              content: compressed.slice(STREAM_CHUNK_SIZE_BYTES),
              version: 0,
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamTrailer',
            value: new DataStream_Trailer({ streamId }),
          },
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual(text);
    });

    it(`should ignore a v2 TEXT data stream with compression if DecompressionStream doesn't exist`, async () => {
      const text = 'hello world';
      const compressed = await deflateRawCompress(new TextEncoder().encode(text));

      let originalCompressionStream: typeof CompressionStream,
        originalDecompressionStream: typeof DecompressionStream;
      try {
        originalCompressionStream = CompressionStream;
        (globalThis as any).CompressionStream = undefined;
        originalDecompressionStream = DecompressionStream;
        (globalThis as any).DecompressionStream = undefined;

        const manager = new IncomingDataStreamManager();
        manager.setConnected(true);

        const readerPromise = new Promise<TextStreamReader>((resolve) => {
          manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
        });

        const streamId = crypto.randomUUID();

        manager.handleDataStreamPacket(
          new DataPacket({
            participantIdentity: 'alice',
            value: {
              case: 'streamHeader',
              value: new DataStream_Header({
                streamId,
                topic: 'my-topic',
                mimeType: 'text/plain',
                timestamp: 0n,
                totalLength: BigInt(text.length),
                compression: DataStream_CompressionType.DEFLATE_RAW,
                contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
              }),
            },
          }),
          Encryption_Type.NONE,
        );
        manager.handleDataStreamPacket(
          new DataPacket({
            participantIdentity: 'alice',
            value: {
              case: 'streamChunk',
              value: new DataStream_Chunk({
                streamId,
                chunkIndex: 0n,
                content: compressed,
                version: 0,
              }),
            },
          }),
          Encryption_Type.NONE,
        );
        manager.handleDataStreamPacket(
          new DataPacket({
            participantIdentity: 'alice',
            value: {
              case: 'streamTrailer',
              value: new DataStream_Trailer({ streamId }),
            },
          }),
          Encryption_Type.NONE,
        );

        // Make sure promise is still pending; the data stream should have been dropped
        await expect(
          Promise.race([readerPromise, Promise.resolve('still pending')]),
        ).resolves.toStrictEqual('still pending');
      } finally {
        (globalThis as any).CompressionStream = originalCompressionStream!;
        (globalThis as any).DecompressionStream = originalDecompressionStream!;
      }
    });

    it(`should ignore a v2 BYTES data stream with compression if DecompressionStream doesn't exist`, async () => {
      const bytes = new Uint8Array([0x01, 0x02, 0x03]);
      const compressed = await deflateRawCompress(bytes);

      let originalCompressionStream: typeof CompressionStream,
        originalDecompressionStream: typeof DecompressionStream;
      try {
        originalCompressionStream = CompressionStream;
        (globalThis as any).CompressionStream = undefined;
        originalDecompressionStream = DecompressionStream;
        (globalThis as any).DecompressionStream = undefined;

        const manager = new IncomingDataStreamManager();
        manager.setConnected(true);

        const readerPromise = new Promise<ByteStreamReader>((resolve) => {
          manager.registerByteStreamHandler('my-topic', (reader) => resolve(reader));
        });

        const streamId = crypto.randomUUID();

        manager.handleDataStreamPacket(
          new DataPacket({
            participantIdentity: 'alice',
            value: {
              case: 'streamHeader',
              value: new DataStream_Header({
                streamId,
                topic: 'my-topic',
                mimeType: 'application/octet-stream',
                timestamp: 0n,
                totalLength: BigInt(bytes.length),
                compression: DataStream_CompressionType.DEFLATE_RAW,
                contentHeader: { case: 'byteHeader', value: new DataStream_ByteHeader({}) },
              }),
            },
          }),
          Encryption_Type.NONE,
        );
        manager.handleDataStreamPacket(
          new DataPacket({
            participantIdentity: 'alice',
            value: {
              case: 'streamChunk',
              value: new DataStream_Chunk({
                streamId,
                chunkIndex: 0n,
                content: compressed,
                version: 0,
              }),
            },
          }),
          Encryption_Type.NONE,
        );
        manager.handleDataStreamPacket(
          new DataPacket({
            participantIdentity: 'alice',
            value: {
              case: 'streamTrailer',
              value: new DataStream_Trailer({ streamId }),
            },
          }),
          Encryption_Type.NONE,
        );

        // Make sure promise is still pending; the data stream should have been dropped
        await expect(
          Promise.race([readerPromise, Promise.resolve('still pending')]),
        ).resolves.toStrictEqual('still pending');
      } finally {
        (globalThis as any).CompressionStream = originalCompressionStream!;
        (globalThis as any).DecompressionStream = originalDecompressionStream!;
      }
    });

    it('should receive a v2 SINGLE PACKET text data stream with zero length', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'text/plain',
              timestamp: 0n,
              totalLength: 0n,
              attributes: { foo: 'bar' },
              inlineContent: new Uint8Array(0), // Empty buffer that is 0 bytes long
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual('');
      expect(reader.info.attributes?.foo).toStrictEqual('bar');
    });

    it('should receive a v2 SINGLE PACKET byte data stream with zero length', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<ByteStreamReader>((resolve) => {
        manager.registerByteStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      manager.handleDataStreamPacket(
        new DataPacket({
          participantIdentity: 'alice',
          value: {
            case: 'streamHeader',
            value: new DataStream_Header({
              streamId,
              topic: 'my-topic',
              mimeType: 'byte/plain',
              timestamp: 0n,
              totalLength: 0n,
              attributes: { foo: 'bar' },
              inlineContent: new Uint8Array(0), // Empty buffer that is 0 bytes long
              contentHeader: { case: 'byteHeader', value: new DataStream_ByteHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual([new Uint8Array(0)]);
      expect(reader.info.attributes?.foo).toStrictEqual('bar');
    });

    it('should receive a v2 MULTI PACKET + COMPRESSED byte data stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<ByteStreamReader>((resolve) => {
        manager.registerByteStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      // Incompressible, so the compressed form stays large enough to need two chunks (but fewer
      // than three).
      const bytes = randomBytes(20_000);
      const compressed = await deflateRawCompress(bytes);
      expect(compressed.length).toBeGreaterThan(STREAM_CHUNK_SIZE_BYTES);
      expect(compressed.length).toBeLessThan(2 * STREAM_CHUNK_SIZE_BYTES);

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'byteHeader', {
          totalLength: BigInt(bytes.length),
          compression: DataStream_CompressionType.DEFLATE_RAW,
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, compressed.slice(0, STREAM_CHUNK_SIZE_BYTES)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 1, compressed.slice(STREAM_CHUNK_SIZE_BYTES)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      const reader = await readerPromise;
      expect(concatChunks(await reader.readAll())).toStrictEqual(bytes);
    });

    it('should drop a duplicate chunk index on a compressed stream and still decode', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = new Array(30)
        .fill(null)
        .map(() => `hello world${randomText(1_000)}`)
        .join('');
      const compressed = await deflateRawCompress(new TextEncoder().encode(text));
      expect(compressed.length).toBeGreaterThan(STREAM_CHUNK_SIZE_BYTES);
      expect(compressed.length).toBeLessThan(2 * STREAM_CHUNK_SIZE_BYTES);

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          totalLength: BigInt(text.length),
          compression: DataStream_CompressionType.DEFLATE_RAW,
        }),
        Encryption_Type.NONE,
      );
      const chunk0 = chunkPacket(streamId, 0, compressed.slice(0, STREAM_CHUNK_SIZE_BYTES));
      manager.handleDataStreamPacket(chunk0, Encryption_Type.NONE);
      // A replayed chunk (e.g. reconnect logic) must be dropped with a warning, not fed to the
      // stateful decompressor a second time.
      manager.handleDataStreamPacket(chunk0, Encryption_Type.NONE);
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 1, compressed.slice(STREAM_CHUNK_SIZE_BYTES)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual(text);
    });

    it('should error on a gap in chunk indices on a compressed stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = new Array(30)
        .fill(null)
        .map(() => `hello world${randomText(1_000)}`)
        .join('');
      const compressed = await deflateRawCompress(new TextEncoder().encode(text));

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          totalLength: BigInt(text.length),
          compression: DataStream_CompressionType.DEFLATE_RAW,
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, compressed.slice(0, STREAM_CHUNK_SIZE_BYTES)),
        Encryption_Type.NONE,
      );
      // Skip chunk index 1 entirely — the stateful decompressor cannot continue past a gap.
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 2, compressed.slice(STREAM_CHUNK_SIZE_BYTES)),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow('Missing chunk(s)');
    });

    it('should reframe multibyte UTF-8 on chunk boundaries when decompressing a text stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = '😀你好世界 café — ¡ñandú! '.repeat(500);
      const textBytes = new TextEncoder().encode(text);
      const compressed = await deflateRawCompress(textBytes);

      // Split the compressed bytes at an arbitrary midpoint: the decompressor's output at the
      // seam can land mid-codepoint, exercising the UTF-8 reframing stage.
      const split = Math.floor(compressed.length / 2);

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          totalLength: BigInt(textBytes.length), // NOTE: byte length, not character count
          compression: DataStream_CompressionType.DEFLATE_RAW,
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, compressed.slice(0, split)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 1, compressed.slice(split)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual(text);
    });

    it('should error when a compressed stream decompresses to fewer bytes than totalLength', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const compressed = await deflateRawCompress(new TextEncoder().encode('hello world')); // 11 bytes

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          totalLength: 16n, // more than the decompressed payload
          compression: DataStream_CompressionType.DEFLATE_RAW,
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(chunkPacket(streamId, 0, compressed), Encryption_Type.NONE);
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      // The reader counts DECOMPRESSED bytes against totalLength.
      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow('Not enough chunk(s)');
    });

    it('should error when a compressed stream decompresses to more bytes than totalLength', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const compressed = await deflateRawCompress(new TextEncoder().encode('hello world')); // 11 bytes

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          totalLength: 5n, // fewer than the decompressed payload
          compression: DataStream_CompressionType.DEFLATE_RAW,
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(chunkPacket(streamId, 0, compressed), Encryption_Type.NONE);
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow('Extra chunk(s)');
    });

    it('should merge trailer attributes on a compressed stream', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';
      const compressed = await deflateRawCompress(new TextEncoder().encode(text));

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          totalLength: BigInt(text.length),
          compression: DataStream_CompressionType.DEFLATE_RAW,
          attributes: { foo: 'bar', baz: 'quux' },
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(chunkPacket(streamId, 0, compressed), Encryption_Type.NONE);
      manager.handleDataStreamPacket(
        trailerPacket(streamId, { hello: 'world', foo: 'updated' }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual(text);
      expect(reader.info.attributes?.baz).toStrictEqual('quux');
      expect(reader.info.attributes?.hello).toStrictEqual('world');
      expect(reader.info.attributes?.foo).toStrictEqual('updated');
    });

    it('should ignore a stream with an unknown compression type', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          totalLength: BigInt(text.length),
          compression: 99 as DataStream_CompressionType,
        }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, new TextEncoder().encode(text)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      // A compression type from a future protocol version can't be decoded; the stream is
      // dropped and the handler is never invoked.
      await expect(
        Promise.race([readerPromise, Promise.resolve('still pending')]),
      ).resolves.toStrictEqual('still pending');
    });
  });

  describe('Receive-side protocol edge cases', () => {
    it('should reject a duplicate TEXT streamId whose stream is already open', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readers: Array<TextStreamReader> = [];
      manager.registerTextStreamHandler('my-topic', (reader) => readers.push(reader));

      const streamId = crypto.randomUUID();
      const header = headerPacket(streamId, 'textHeader', { totalLength: 11n });

      manager.handleDataStreamPacket(header, Encryption_Type.NONE);
      expect(readers).toHaveLength(1);

      // A second header re-using an open streamId must be rejected, not silently replace (or
      // corrupt) the in-flight stream.
      expect(() => manager.handleDataStreamPacket(header, Encryption_Type.NONE)).toThrow(
        'already in progress',
      );
      expect(readers).toHaveLength(1);
    });

    it('should reject a duplicate BYTE streamId whose stream is already open', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readers: Array<ByteStreamReader> = [];
      manager.registerByteStreamHandler('my-topic', (reader) => readers.push(reader));

      const streamId = crypto.randomUUID();
      const header = headerPacket(streamId, 'byteHeader', { totalLength: 4n });

      manager.handleDataStreamPacket(header, Encryption_Type.NONE);
      expect(readers).toHaveLength(1);

      expect(() => manager.handleDataStreamPacket(header, Encryption_Type.NONE)).toThrow(
        'already in progress',
      );
      expect(readers).toHaveLength(1);
    });

    it('should ignore empty chunks', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', { totalLength: BigInt(text.length) }),
        Encryption_Type.NONE,
      );
      // An empty chunk must not count against totalLength or corrupt the stream.
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, new Uint8Array(0)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 1, new TextEncoder().encode(text)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      const reader = await readerPromise;
      expect(await reader.readAll()).toStrictEqual(text);
    });

    it('should silently drop packets for a topic with no registered handler', () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const streamId = crypto.randomUUID();

      // No handler registered for the topic: header, chunks, and trailer are all dropped
      // without raising.
      expect(() => {
        manager.handleDataStreamPacket(
          headerPacket(streamId, 'textHeader', { totalLength: 11n }),
          Encryption_Type.NONE,
        );
        manager.handleDataStreamPacket(
          chunkPacket(streamId, 0, new TextEncoder().encode('hello world')),
          Encryption_Type.NONE,
        );
        manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);
      }).not.toThrow();
    });

    it('should error the reader when the trailer reports an abnormal close reason', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', { totalLength: BigInt(text.length) }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, new TextEncoder().encode(text)),
        Encryption_Type.NONE,
      );
      // A non-empty trailer reason means the sender aborted; the stream must not be reported as
      // a successful close.
      manager.handleDataStreamPacket(
        trailerPacket(streamId, undefined, 'cancelled'),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow('closed abnormally: cancelled');
    });

    it('should error an inline compressed payload that inflates past the max payload size', async () => {
      // Decompression-bomb guard: a tiny compressed inline payload must not be allowed to
      // expand without bound.
      const manager = new IncomingDataStreamManager(1_000);
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = randomText(50_000);
      const textBytes = new TextEncoder().encode(text);
      const compressed = await deflateRawCompress(textBytes);

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          totalLength: BigInt(textBytes.length),
          compression: DataStream_CompressionType.DEFLATE_RAW,
          inlineContent: compressed,
        }),
        Encryption_Type.NONE,
      );

      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow('maximum payload size');
    });

    it('should error a chunked compressed stream that inflates past the max payload size', async () => {
      const manager = new IncomingDataStreamManager(50_000);
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = randomText(60_000); // decompresses past the 50k cap
      const textBytes = new TextEncoder().encode(text);
      const compressed = await deflateRawCompress(textBytes);

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', {
          totalLength: BigInt(textBytes.length),
          compression: DataStream_CompressionType.DEFLATE_RAW,
        }),
        Encryption_Type.NONE,
      );
      for (let offset = 0, index = 0; offset < compressed.length; offset += 15_000, index += 1) {
        manager.handleDataStreamPacket(
          chunkPacket(streamId, index, compressed.slice(offset, offset + 15_000)),
          Encryption_Type.NONE,
        );
      }
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.NONE);

      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow('maximum payload size');
    });

    it('should error the reader when the trailer has a mismatched encryption type', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();
      const text = 'hello world';

      manager.handleDataStreamPacket(
        headerPacket(streamId, 'textHeader', { totalLength: BigInt(text.length) }),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(
        chunkPacket(streamId, 0, new TextEncoder().encode(text)),
        Encryption_Type.NONE,
      );
      manager.handleDataStreamPacket(trailerPacket(streamId), Encryption_Type.GCM);

      const reader = await readerPromise;
      await expect(reader.readAll()).rejects.toThrow('Encryption type mismatch');
    });
  });
});
