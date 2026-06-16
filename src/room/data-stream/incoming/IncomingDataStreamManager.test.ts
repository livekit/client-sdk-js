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
import { createDeflateRaw, constants } from 'zlib';
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

    it.only('should receive a v2 multi packet + compressed data stream and emit chunks at Z_SYNC_FLUSH boundaries', async () => {
      const manager = new IncomingDataStreamManager();
      manager.setConnected(true);

      const readerPromise = new Promise<TextStreamReader>((resolve) => {
        manager.registerTextStreamHandler('my-topic', (reader) => resolve(reader));
      });

      const streamId = crypto.randomUUID();

      // Generate a mostly incompressible compressed stream, with Z_SYNC_FLUSH between each chunk
      const text = new Array(30).fill(0).map(() => `hello world${randomText(1_000)}`);
      const bytes = text.map((b) => new TextEncoder().encode(b));
      const stream = createDeflateRaw();
      let pending: Array<Buffer> = [];
      stream.on('data', (chunk: Buffer) => pending.push(chunk));

      const compressed: Array<Uint8Array> = [];
      for (const item of bytes) {
        stream.write(item);
        await new Promise<void>((resolve) => stream.flush(constants.Z_SYNC_FLUSH, resolve));
        compressed.push(Buffer.concat(pending));
        pending = [];
      }
      const closePromise = new Promise<void>((resolve, reject) => {
        stream.once('end', resolve);
        stream.once('error', reject);
      });
      stream.end();
      await closePromise;
      // The final deflate block is emitted on end(); fold it into the last write's chunk so the
      // receiver's single decompressor terminates cleanly right after emitting the last write.
      compressed[compressed.length - 1] = Buffer.concat([compressed[compressed.length - 1], ...pending]);

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
              totalLength: BigInt(bytes.reduce((acc, i) => acc + i.byteLength, 0)),
              attributes: { [COMPRESSION_ATTRIBUTE]: COMPRESSION_DEFLATE_RAW },
              contentHeader: { case: 'textHeader', value: new DataStream_TextHeader({}) },
            }),
          },
        }),
        Encryption_Type.NONE,
      );
      for (let index = 0; index < compressed.length; index += 1) {
        const item = compressed[index];
        manager.handleDataStreamPacket(
          new DataPacket({
            participantIdentity: 'alice',
            value: {
              case: 'streamChunk',
              value: new DataStream_Chunk({
                streamId,
                chunkIndex: BigInt(index),
                content: item,
                version: 0,
              }),
            },
          }),
          Encryption_Type.NONE,
        );
      }
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

      // Make sure that stream chunks each get emitted sequentially and are passed out of the reader
      const reader = await readerPromise;
      const iterator = reader[Symbol.asyncIterator]();

      for (let index = 0; index < text.length; index += 1) {
        const chunk = await iterator.next();
        expect(chunk.done).toStrictEqual(false);
        console.log('AA', chunk.value, text[index]);
        expect(chunk.value).toStrictEqual(text[index]);
      }
      const final = await iterator.next();
      expect(final.done).toStrictEqual(true);
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
