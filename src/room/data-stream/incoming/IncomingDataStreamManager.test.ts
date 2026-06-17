import {
  DataPacket,
  DataStream_ByteHeader,
  DataStream_Chunk,
  DataStream_Header,
  DataStream_TextHeader,
  DataStream_Trailer,
  Encryption_Type,
} from '@livekit/protocol';
import { describe, expect, it } from 'vitest';
import { encodeBase64 } from '../../utils';
import { INLINE_PAYLOAD_ATTRIBUTE, COMPRESSION_ATTRIBUTE, COMPRESSION_DEFLATE_RAW, STREAM_CHUNK_SIZE_BYTES } from '../constants';
import IncomingDataStreamManager from './IncomingDataStreamManager';
import type { ByteStreamReader, TextStreamReader } from './StreamReader';
import { deflateRawCompress } from '../compression';

/** Builds a low quality random string of the given length. */
function randomText(length: number): string {
  let s = '';
  while (s.length < length) {
    s += Math.random().toString(36).slice(2);
  }
  return s.slice(0, length);
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
              attributes: { [INLINE_PAYLOAD_ATTRIBUTE]: text, foo: 'bar' },
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
      expect(await attachmentStreamReader.readAll()).toStrictEqual([new Uint8Array([0x01, 0x02, 0x03])]);
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
            value: new DataStream_Trailer({ streamId, attributes: { hello: 'world', foo: 'updated' } }),
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
              attributes: { [INLINE_PAYLOAD_ATTRIBUTE]: text, foo: 'bar' },
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
      const bytes = encodeBase64(new Uint8Array([0x01, 0x02, 0x03]));

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
              attributes: { [INLINE_PAYLOAD_ATTRIBUTE]: bytes },
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
      const compressed = encodeBase64(await deflateRawCompress(new TextEncoder().encode(text)));

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
              attributes: {
                [INLINE_PAYLOAD_ATTRIBUTE]: compressed,
                [COMPRESSION_ATTRIBUTE]: COMPRESSION_DEFLATE_RAW,
                foo: 'bar'
              },
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
      const compressed = encodeBase64(await deflateRawCompress(bytes));

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
              attributes: {
                [INLINE_PAYLOAD_ATTRIBUTE]: compressed,
                [COMPRESSION_ATTRIBUTE]: COMPRESSION_DEFLATE_RAW,
              },
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
      const text = new Array(30).fill(null).map(() => `hello world${randomText(1_000)}`).join('');

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
              attributes: { [COMPRESSION_ATTRIBUTE]: COMPRESSION_DEFLATE_RAW },
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

      let originalCompressionStream: typeof CompressionStream, originalDecompressionStream: typeof DecompressionStream;
      try {
        originalCompressionStream = CompressionStream;
        (CompressionStream as any) = undefined;
        originalDecompressionStream = DecompressionStream;
        (DecompressionStream as any) = undefined;

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
                attributes: { [COMPRESSION_ATTRIBUTE]: COMPRESSION_DEFLATE_RAW },
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
        CompressionStream = originalCompressionStream!;
        DecompressionStream = originalDecompressionStream!;
      }
    });

    it(`should ignore a v2 BYTES data stream with compression if DecompressionStream doesn't exist`, async () => {
      const bytes = new Uint8Array([0x01, 0x02, 0x03]);
      const compressed = await deflateRawCompress(bytes);

      let originalCompressionStream: typeof CompressionStream, originalDecompressionStream: typeof DecompressionStream;
      try {
        originalCompressionStream = CompressionStream;
        (CompressionStream as any) = undefined;
        originalDecompressionStream = DecompressionStream;
        (DecompressionStream as any) = undefined;

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
                totalLength: BigInt(bytes.length),
                attributes: { [COMPRESSION_ATTRIBUTE]: COMPRESSION_DEFLATE_RAW },
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
        CompressionStream = originalCompressionStream!;
        DecompressionStream = originalDecompressionStream!;
      }
    });
  });
});
