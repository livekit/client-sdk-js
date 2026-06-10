import {
  type DataPacket,
  DataStream_Chunk,
  DataStream_Header,
  DataStream_Trailer,
  Encryption_Type,
} from '@livekit/protocol';
import log from '../../../logger';
import { DataStreamError, DataStreamErrorReason } from '../../errors';
import { type ByteStreamInfo, type StreamController, type TextStreamInfo } from '../../types';
import { bigIntToNumber, decodeBase64, numberToBigInt } from '../../utils';
import { gzipDecompress, inflateRawStream } from '../compression';
import {
  COMPRESSION_ATTRIBUTE,
  COMPRESSION_DEFLATE_RAW,
  COMPRESSION_GZIP,
  INLINE_PAYLOAD_ATTRIBUTE,
} from '../constants';
import {
  type ByteStreamHandler,
  ByteStreamReader,
  type TextStreamHandler,
  TextStreamReader,
} from './StreamReader';

export default class IncomingDataStreamManager {
  private log = log;

  private byteStreamControllers = new Map<string, StreamController<DataStream_Chunk>>();

  private textStreamControllers = new Map<string, StreamController<DataStream_Chunk>>();

  private byteStreamHandlers = new Map<string, ByteStreamHandler>();

  private textStreamHandlers = new Map<string, TextStreamHandler>();

  private isConnected = false;

  private bufferedPackets: Array<{ packet: DataPacket; encryptionType: Encryption_Type }> = [];

  setConnected(connected: boolean) {
    this.isConnected = connected;
    if (connected) {
      this.flushBufferedPackets();
    }
  }

  private flushBufferedPackets() {
    const packets = this.bufferedPackets;
    this.bufferedPackets = [];
    for (const { packet, encryptionType } of packets) {
      this.handleDataStreamPacket(packet, encryptionType);
    }
  }

  registerTextStreamHandler(topic: string, callback: TextStreamHandler) {
    if (this.textStreamHandlers.has(topic)) {
      throw new DataStreamError(
        `A text stream handler for topic "${topic}" has already been set.`,
        DataStreamErrorReason.HandlerAlreadyRegistered,
      );
    }
    this.textStreamHandlers.set(topic, callback);
  }

  unregisterTextStreamHandler(topic: string) {
    this.textStreamHandlers.delete(topic);
  }

  registerByteStreamHandler(topic: string, callback: ByteStreamHandler) {
    if (this.byteStreamHandlers.has(topic)) {
      throw new DataStreamError(
        `A byte stream handler for topic "${topic}" has already been set.`,
        DataStreamErrorReason.HandlerAlreadyRegistered,
      );
    }
    this.byteStreamHandlers.set(topic, callback);
  }

  unregisterByteStreamHandler(topic: string) {
    this.byteStreamHandlers.delete(topic);
  }

  clearControllers() {
    this.byteStreamControllers.clear();
    this.textStreamControllers.clear();
    this.bufferedPackets = [];
  }

  validateParticipantHasNoActiveDataStreams(participantIdentity: string) {
    // Terminate any in flight data stream receives from the given participant
    const textStreamsBeingSentByDisconnectingParticipant = Array.from(
      this.textStreamControllers.entries(),
    ).filter((entry) => entry[1].sendingParticipantIdentity === participantIdentity);
    const byteStreamsBeingSentByDisconnectingParticipant = Array.from(
      this.byteStreamControllers.entries(),
    ).filter((entry) => entry[1].sendingParticipantIdentity === participantIdentity);

    if (
      textStreamsBeingSentByDisconnectingParticipant.length > 0 ||
      byteStreamsBeingSentByDisconnectingParticipant.length > 0
    ) {
      const abnormalEndError = new DataStreamError(
        `Participant ${participantIdentity} unexpectedly disconnected in the middle of sending data`,
        DataStreamErrorReason.AbnormalEnd,
      );
      for (const [id, controller] of byteStreamsBeingSentByDisconnectingParticipant) {
        controller.controller.error(abnormalEndError);
        this.byteStreamControllers.delete(id);
      }
      for (const [id, controller] of textStreamsBeingSentByDisconnectingParticipant) {
        controller.controller.error(abnormalEndError);
        this.textStreamControllers.delete(id);
      }
    }
  }

  handleDataStreamPacket(packet: DataPacket, encryptionType: Encryption_Type) {
    if (!this.isConnected) {
      this.bufferedPackets.push({ packet, encryptionType });
      return;
    }
    switch (packet.value.case) {
      case 'streamHeader':
        return this.handleStreamHeader(
          packet.value.value,
          packet.participantIdentity,
          encryptionType,
        );
      case 'streamChunk':
        return this.handleStreamChunk(packet.value.value, encryptionType);
      case 'streamTrailer':
        return this.handleStreamTrailer(packet.value.value, encryptionType);
      default:
        throw new Error(`DataPacket of value "${packet.value.case}" is not data stream related!`);
    }
  }

  private handleStreamHeader(
    streamHeader: DataStream_Header,
    participantIdentity: string,
    encryptionType: Encryption_Type,
  ) {
    switch (streamHeader.contentHeader.case) {
      case 'byteHeader': {
        const streamHandlerCallback = this.byteStreamHandlers.get(streamHeader.topic);
        if (!streamHandlerCallback) {
          this.log.debug(
            'ignoring incoming byte stream due to no handler for topic',
            streamHeader.topic,
          );
          return;
        }

        let streamController: ReadableStreamDefaultController<DataStream_Chunk>;

        const info: ByteStreamInfo = {
          id: streamHeader.streamId,
          name: streamHeader.contentHeader.value.name ?? 'unknown',
          mimeType: streamHeader.mimeType,
          size: streamHeader.totalLength ? Number(streamHeader.totalLength) : undefined,
          topic: streamHeader.topic,
          timestamp: bigIntToNumber(streamHeader.timestamp),
          attributes: streamHeader.attributes,
          encryptionType,
        };

        const compressed = info.attributes![COMPRESSION_ATTRIBUTE] === COMPRESSION_GZIP;

        // Single-packet stream: the entire payload was smuggled into a reserved header attribute.
        // Synthesize an already-complete stream and skip waiting for chunk/trailer packets.
        const inlinePayload = streamHeader.attributes[INLINE_PAYLOAD_ATTRIBUTE];
        if (typeof inlinePayload !== 'undefined') {
          delete info.attributes![INLINE_PAYLOAD_ATTRIBUTE];
          delete info.attributes![COMPRESSION_ATTRIBUTE];
          const bytes = decodeBase64(inlinePayload);
          streamHandlerCallback(
            new ByteStreamReader(
              info,
              createInlineStream(streamHeader.streamId, compressed ? gzipDecompress(bytes) : bytes),
              bigIntToNumber(streamHeader.totalLength),
            ),
            { identity: participantIdentity },
          );
          return;
        }

        if (compressed) {
          delete info.attributes![COMPRESSION_ATTRIBUTE];
        }

        const stream = new ReadableStream<DataStream_Chunk>({
          start: (controller) => {
            streamController = controller;

            if (this.textStreamControllers.has(streamHeader.streamId)) {
              throw new DataStreamError(
                `A data stream read is already in progress for a stream with id ${streamHeader.streamId}.`,
                DataStreamErrorReason.AlreadyOpened,
              );
            }

            this.byteStreamControllers.set(streamHeader.streamId, {
              info,
              controller: streamController,
              startTime: Date.now(),
              sendingParticipantIdentity: participantIdentity,
            });
          },
        });
        streamHandlerCallback(
          new ByteStreamReader(
            info,
            compressed ? decompressedChunkStream(stream, streamHeader.streamId, 'byte') : stream,
            // Compressed streams report no total length; completion is driven by the trailer.
            compressed ? undefined : bigIntToNumber(streamHeader.totalLength),
          ),
          {
            identity: participantIdentity,
          },
        );
        break;
      }
      case 'textHeader': {
        const streamHandlerCallback = this.textStreamHandlers.get(streamHeader.topic);
        if (!streamHandlerCallback) {
          this.log.debug(
            'ignoring incoming text stream due to no handler for topic',
            streamHeader.topic,
          );
          return;
        }

        let streamController: ReadableStreamDefaultController<DataStream_Chunk>;

        const info: TextStreamInfo = {
          id: streamHeader.streamId,
          mimeType: streamHeader.mimeType,
          size: streamHeader.totalLength ? Number(streamHeader.totalLength) : undefined,
          topic: streamHeader.topic,
          timestamp: Number(streamHeader.timestamp),
          attributes: streamHeader.attributes,
          encryptionType,
          attachedStreamIds: streamHeader.contentHeader.value.attachedStreamIds,
        };

        // Inline payloads are compressed as one-shot gzip; chunked streams as a single raw-deflate
        // stream spanning all chunks (see COMPRESSION_DEFLATE_RAW).
        const inlineCompressed = info.attributes![COMPRESSION_ATTRIBUTE] === COMPRESSION_GZIP;
        const streamCompressed =
          info.attributes![COMPRESSION_ATTRIBUTE] === COMPRESSION_DEFLATE_RAW;

        // Single-packet stream: the entire payload was smuggled into a reserved header attribute.
        // Synthesize an already-complete stream and skip waiting for chunk/trailer packets.
        const inlinePayload = streamHeader.attributes[INLINE_PAYLOAD_ATTRIBUTE];
        if (typeof inlinePayload !== 'undefined') {
          delete info.attributes![INLINE_PAYLOAD_ATTRIBUTE];
          delete info.attributes![COMPRESSION_ATTRIBUTE];
          // Compressed text is base64(gzip(utf-8)); uncompressed text is the raw string.
          const content = inlineCompressed
            ? gzipDecompress(decodeBase64(inlinePayload))
            : new TextEncoder().encode(inlinePayload);
          streamHandlerCallback(
            new TextStreamReader(
              info,
              createInlineStream(streamHeader.streamId, content),
              bigIntToNumber(streamHeader.totalLength),
            ),
            { identity: participantIdentity },
          );
          return;
        }

        if (streamCompressed) {
          delete info.attributes![COMPRESSION_ATTRIBUTE];
        }

        const stream = new ReadableStream<DataStream_Chunk>({
          start: (controller) => {
            streamController = controller;

            if (this.textStreamControllers.has(streamHeader.streamId)) {
              throw new DataStreamError(
                `A data stream read is already in progress for a stream with id ${streamHeader.streamId}.`,
                DataStreamErrorReason.AlreadyOpened,
              );
            }

            this.textStreamControllers.set(streamHeader.streamId, {
              info,
              controller: streamController,
              startTime: Date.now(),
              sendingParticipantIdentity: participantIdentity,
            });
          },
        });
        streamHandlerCallback(
          new TextStreamReader(
            info,
            streamCompressed ? inflateRawChunkStream(stream, streamHeader.streamId) : stream,
            // `totalLength` is the pre-compression size, and the reader sees decompressed bytes, so
            // it applies to both paths.
            bigIntToNumber(streamHeader.totalLength),
          ),
          { identity: participantIdentity },
        );
        break;
      }
    }
  }

  private handleStreamChunk(chunk: DataStream_Chunk, encryptionType: Encryption_Type) {
    const fileBuffer = this.byteStreamControllers.get(chunk.streamId);
    if (fileBuffer) {
      if (fileBuffer.info.encryptionType !== encryptionType) {
        fileBuffer.controller.error(
          new DataStreamError(
            `Encryption type mismatch for stream ${chunk.streamId}. Expected ${encryptionType}, got ${fileBuffer.info.encryptionType}`,
            DataStreamErrorReason.EncryptionTypeMismatch,
          ),
        );
        this.byteStreamControllers.delete(chunk.streamId);
      } else if (chunk.content.length > 0) {
        fileBuffer.controller.enqueue(chunk);
      }
    }
    const textBuffer = this.textStreamControllers.get(chunk.streamId);
    if (textBuffer) {
      if (textBuffer.info.encryptionType !== encryptionType) {
        textBuffer.controller.error(
          new DataStreamError(
            `Encryption type mismatch for stream ${chunk.streamId}. Expected ${encryptionType}, got ${textBuffer.info.encryptionType}`,
            DataStreamErrorReason.EncryptionTypeMismatch,
          ),
        );
        this.textStreamControllers.delete(chunk.streamId);
      } else if (chunk.content.length > 0) {
        textBuffer.controller.enqueue(chunk);
      }
    }
  }

  private handleStreamTrailer(trailer: DataStream_Trailer, encryptionType: Encryption_Type) {
    const textBuffer = this.textStreamControllers.get(trailer.streamId);
    if (textBuffer) {
      if (textBuffer.info.encryptionType !== encryptionType) {
        textBuffer.controller.error(
          new DataStreamError(
            `Encryption type mismatch for stream ${trailer.streamId}. Expected ${encryptionType}, got ${textBuffer.info.encryptionType}`,
            DataStreamErrorReason.EncryptionTypeMismatch,
          ),
        );
      } else {
        textBuffer.info.attributes = { ...textBuffer.info.attributes, ...trailer.attributes };
        textBuffer.controller.close();
        this.textStreamControllers.delete(trailer.streamId);
      }
    }

    const fileBuffer = this.byteStreamControllers.get(trailer.streamId);
    if (fileBuffer) {
      if (fileBuffer.info.encryptionType !== encryptionType) {
        fileBuffer.controller.error(
          new DataStreamError(
            `Encryption type mismatch for stream ${trailer.streamId}. Expected ${encryptionType}, got ${fileBuffer.info.encryptionType}`,
            DataStreamErrorReason.EncryptionTypeMismatch,
          ),
        );
      } else {
        fileBuffer.info.attributes = { ...fileBuffer.info.attributes, ...trailer.attributes };
        fileBuffer.controller.close();
      }
      this.byteStreamControllers.delete(trailer.streamId);
    }
  }
}

/**
 * Builds a `ReadableStream` that yields the given content as a single chunk and then immediately
 * closes - used to surface an inline (single-packet) data stream as a fully-formed stream. `content`
 * may be a promise (e.g. async gzip decompression); a rejection errors the stream.
 */
function createInlineStream(
  streamId: string,
  content: Uint8Array | Promise<Uint8Array>,
): ReadableStream<DataStream_Chunk> {
  return new ReadableStream<DataStream_Chunk>({
    start: async (controller) => {
      try {
        const bytes = await content;
        controller.enqueue(
          new DataStream_Chunk({ streamId, chunkIndex: BigInt(0), content: bytes }),
        );
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Transforms a stream of deflate-raw-compressed text `DataStream_Chunk`s into a stream of
 * decompressed chunks, so `TextStreamReader` consumes it unchanged.
 *
 * The sender runs a single raw-deflate context across the whole stream, sync-flushing at every
 * write boundary, so the receiver feeds all chunk contents (in `chunkIndex` order) through ONE
 * decompressor and gets each write's content emitted as soon as its chunks arrive. A streaming
 * `TextDecoder` reframes the decompressed bytes on UTF-8 character boundaries (a write larger than
 * the MTU spans several packets, which may split a codepoint) so each synthesized chunk decodes
 * independently. Errors on the source stream (e.g. encryption mismatch, abnormal end) propagate to
 * the reader.
 */
function inflateRawChunkStream(
  raw: ReadableStream<DataStream_Chunk>,
  streamId: string,
): ReadableStream<DataStream_Chunk> {
  const srcReader = raw.getReader();

  // Stage 1: unwrap chunk packets to compressed bytes, guarding ordering. A stateful decompressor
  // silently corrupts on duplicated or out-of-order input, so duplicates are dropped (with a
  // warning - in-order delivery is expected on the reliable channel, but reconnect handling may
  // replay) and a gap is a hard error.
  let lastChunkIndex = -1;
  const compressedBytes = new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      for (;;) {
        const { done, value } = await srcReader.read();
        if (done) {
          controller.close();
          return;
        }
        const index = bigIntToNumber(value.chunkIndex);
        if (index <= lastChunkIndex) {
          log.warn(
            `ignoring duplicate chunk ${index} for compressed data stream ${streamId} (last processed: ${lastChunkIndex})`,
          );
          continue;
        }
        if (index > lastChunkIndex + 1) {
          throw new DataStreamError(
            `Missing chunk(s) ${lastChunkIndex + 1}..${index - 1} for compressed data stream ${streamId} - cannot continue decompressing`,
            DataStreamErrorReason.Incomplete,
          );
        }
        lastChunkIndex = index;
        controller.enqueue(value.content);
        return;
      }
    },
    cancel: (reason) => srcReader.cancel(reason),
  });

  // Stage 2: one decompressor for the stream's lifetime.
  const decompressedReader = inflateRawStream(compressedBytes).getReader();

  // Stage 3: reframe decompressed bytes on UTF-8 boundaries and re-wrap as chunks.
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const encoder = new TextEncoder();
  let outIndex = 0;
  const decodeOrThrow = (bytes?: Uint8Array): string => {
    try {
      return bytes ? decoder.decode(bytes, { stream: true }) : decoder.decode();
    } catch (err) {
      throw new DataStreamError(
        `Cannot decode compressed data stream ${streamId} as text: ${err}`,
        DataStreamErrorReason.DecodeFailed,
      );
    }
  };

  return new ReadableStream<DataStream_Chunk>({
    pull: async (controller) => {
      for (;;) {
        const { done, value } = await decompressedReader.read();
        if (done) {
          const tail = decodeOrThrow();
          if (tail.length > 0) {
            controller.enqueue(makeChunk(streamId, outIndex++, encoder.encode(tail)));
          }
          controller.close();
          return;
        }
        const text = decodeOrThrow(value);
        if (text.length > 0) {
          controller.enqueue(makeChunk(streamId, outIndex++, encoder.encode(text)));
          return;
        }
        // Everything so far was a partial codepoint; keep pulling.
      }
    },
    cancel: (reason) => {
      decompressedReader.cancel(reason).catch(() => {});
      srcReader.cancel(reason).catch(() => {});
    },
  });
}

/**
 * Transforms a raw stream of (compressed) `DataStream_Chunk`s into a stream of decompressed
 * `DataStream_Chunk`s, so the existing `ByteStreamReader`/`TextStreamReader` consume it unchanged.
 *
 * The sender compresses each `write()` into its own gzip member and tags every chunk with that
 * member's index in `chunk.version`. Browsers' `DecompressionStream` only accepts a single member
 * per gzip stream, so we feed each member's chunks into its own `DecompressionStream` as they arrive
 * (never buffering the whole member) and start a fresh one when the member index changes, draining
 * decompressed output incrementally. For text, a streaming `TextDecoder` reframes the decompressed
 * bytes on UTF-8 character boundaries across members so each synthesized chunk decodes independently.
 * Errors on the source stream (e.g. encryption mismatch, abnormal end) propagate to the reader.
 */
function decompressedChunkStream(
  raw: ReadableStream<DataStream_Chunk>,
  streamId: string,
  kind: 'byte' | 'text',
): ReadableStream<DataStream_Chunk> {
  const srcReader = raw.getReader();
  const decoder = kind === 'text' ? new TextDecoder() : undefined;
  const encoder = kind === 'text' ? new TextEncoder() : undefined;
  let outIndex = 0;

  const enqueueDecompressed = (
    controller: ReadableStreamDefaultController<DataStream_Chunk>,
    bytes: Uint8Array,
  ) => {
    const content = decoder ? encoder!.encode(decoder.decode(bytes, { stream: true })) : bytes;
    if (content.byteLength > 0) {
      controller.enqueue(makeChunk(streamId, outIndex++, content));
    }
  };

  const pump = async (controller: ReadableStreamDefaultController<DataStream_Chunk>) => {
    let currentMember: number | undefined;
    let dsWriter: WritableStreamDefaultWriter<BufferSource> | null = null;
    let drain: Promise<void> | null = null;

    const openMember = () => {
      const ds = new DecompressionStream('gzip');
      dsWriter = ds.writable.getWriter();
      const dsReader = ds.readable.getReader();
      // Drain this member's decompressed output concurrently with feeding its input.
      drain = (async () => {
        for (;;) {
          const { done, value } = await dsReader.read();
          if (done) {
            break;
          }
          enqueueDecompressed(controller, value);
        }
      })();
    };

    // Close the current member's compressor input and wait for its remaining output to drain.
    const closeMember = async () => {
      if (dsWriter) {
        await dsWriter.close();
        await drain;
        dsWriter = null;
        drain = null;
      }
    };

    for (;;) {
      const { done, value } = await srcReader.read();
      if (done) {
        await closeMember();
        const tail = decoder?.decode();
        if (tail) {
          controller.enqueue(makeChunk(streamId, outIndex++, encoder!.encode(tail)));
        }
        controller.close();
        return;
      }
      // A change in member index means the previous gzip member is complete.
      if (currentMember !== undefined && value.version !== currentMember) {
        await closeMember();
      }
      if (!dsWriter) {
        openMember();
      }
      currentMember = value.version;
      await dsWriter!.write(value.content as NonSharedUint8Array);
    }
  };

  return new ReadableStream<DataStream_Chunk>({
    start: (controller) => {
      pump(controller).catch((err) => controller.error(err));
    },
    cancel: (reason) => {
      srcReader.cancel(reason);
    },
  });
}

function makeChunk(streamId: string, chunkIndex: number, content: Uint8Array): DataStream_Chunk {
  return new DataStream_Chunk({
    streamId,
    chunkIndex: numberToBigInt(chunkIndex),
    content: content as NonSharedUint8Array,
  });
}
