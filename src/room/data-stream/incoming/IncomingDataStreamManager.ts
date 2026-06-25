import {
  type DataPacket,
  DataStream_Chunk,
  DataStream_CompressionType,
  DataStream_Header,
  DataStream_Trailer,
  Encryption_Type,
} from '@livekit/protocol';
import log from '../../../logger';
import { DataStreamError, DataStreamErrorReason } from '../../errors';
import { type ByteStreamInfo, type StreamController, type TextStreamInfo } from '../../types';
import { bigIntToNumber, isCompressionStreamSupported, numberToBigInt } from '../../utils';
import { deflateRawDecompress, inflateRawStream } from '../compression';
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

        // Both inline and chunked byte payloads are deflate-raw compressed; inline as a one-shot
        // buffer, chunked as a single stream spanning all chunks (mirrors text).
        const compressed = streamHeader.compression === DataStream_CompressionType.DEFLATE_RAW;

        if (compressed && !isCompressionStreamSupported()) {
          // NOTE: this shouldn't really ever happen, if this warning is logged then the sender
          // isn't properly abiding by the data streams v2 protocol.
          log.warn(
            `Data stream ${streamHeader.streamId} received with deflate-raw compression, but this browser does not have support for DecompressionStream. Dropping...`,
          );
          return;
        }

        // Single-packet stream: the entire payload was packaged into the header's `inlineContent`.
        // Synthesize an already-complete stream and skip waiting for chunk/trailer packets.
        const inlineContent = streamHeader.inlineContent;
        if (typeof inlineContent !== 'undefined') {
          // Inline bytes are the raw payload, optionally deflate-raw compressed.
          streamHandlerCallback(
            new ByteStreamReader(
              info,
              createInlineStream(
                streamHeader.streamId,
                compressed ? deflateRawDecompress(inlineContent) : inlineContent,
              ),
              bigIntToNumber(streamHeader.totalLength),
            ),
            { identity: participantIdentity },
          );
          return;
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
            compressed ? inflateRawByteChunkStream(stream, streamHeader.streamId) : stream,
            // `totalLength` is the pre-compression size, and the reader counts decompressed bytes,
            // so it applies to both paths (mirrors text).
            bigIntToNumber(streamHeader.totalLength),
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

        // Both inline and chunked text payloads are deflate-raw compressed; inline as a one-shot
        // buffer, chunked as a single stream spanning all chunks.
        const compressed = streamHeader.compression === DataStream_CompressionType.DEFLATE_RAW;

        if (compressed && !isCompressionStreamSupported()) {
          // NOTE: this shouldn't really ever happen, if this warning is logged then the sender
          // isn't properly abiding by the data streams v2 protocol.
          log.warn(
            `Data stream ${streamHeader.streamId} received with deflate-raw compression, but this browser does not have support for DecompressionStream. Dropping...`,
          );
          return;
        }

        // Single-packet stream: the entire payload was smuggled into the header's `inlineContent`.
        // Synthesize an already-complete stream and skip waiting for chunk/trailer packets.
        const inlineContent = streamHeader.inlineContent;
        if (typeof inlineContent !== 'undefined') {
          // Inline text is the raw UTF-8 payload, optionally deflate-raw compressed.
          const content = compressed ? deflateRawDecompress(inlineContent) : inlineContent;
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
            compressed ? inflateRawChunkStream(stream, streamHeader.streamId) : stream,
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
 * Unwraps a stream of compressed `DataStream_Chunk`s to their compressed bytes (in `chunkIndex`
 * order), guarding ordering for the stateful decompressor that consumes them. A stateful
 * decompressor silently corrupts on duplicated or out-of-order input, so duplicates are dropped
 * (with a warning - in-order delivery is expected on the reliable channel, but reconnect handling
 * may replay) and a gap is a hard error. Shared by the text and byte deflate-raw decoders.
 */
function orderedCompressedBytes(
  srcReader: ReadableStreamDefaultReader<DataStream_Chunk>,
  streamId: string,
): ReadableStream<Uint8Array> {
  let lastChunkIndex = -1;
  return new ReadableStream<Uint8Array>({
    pull: async (controller) => {
      while (true) {
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
}

/**
 * Transforms a stream of deflate-raw-compressed byte `DataStream_Chunk`s into a stream of
 * decompressed chunks, so `ByteStreamReader` consumes it unchanged. All chunk contents are fed (in
 * `chunkIndex` order) through ONE raw-deflate decompressor for the stream's lifetime; decompressed
 * output is re-wrapped as chunks as soon as it is produced. The sender (sendFile) compresses the
 * whole payload in one shot, but the format also supports a single context-takeover stream
 * sync-flushed at write boundaries, so a future incremental streamBytes could compress with no
 * protocol change. Errors on the source stream propagate to the reader.
 */
function inflateRawByteChunkStream(
  raw: ReadableStream<DataStream_Chunk>,
  streamId: string,
): ReadableStream<DataStream_Chunk> {
  const srcReader = raw.getReader();
  const decompressedReader = inflateRawStream(
    orderedCompressedBytes(srcReader, streamId),
  ).getReader();

  let outIndex = 0;
  return new ReadableStream<DataStream_Chunk>({
    pull: async (controller) => {
      while (true) {
        const { done, value } = await decompressedReader.read();
        if (done) {
          controller.close();
          return;
        }
        if (value.byteLength > 0) {
          controller.enqueue(makeChunk(streamId, outIndex++, value));
          return;
        }
        // Inflate can emit empty reads; keep pulling until there is content or the stream ends.
      }
    },
    cancel: (reason) => {
      decompressedReader.cancel(reason).catch(() => {});
      srcReader.cancel(reason).catch(() => {});
    },
  });
}

/**
 * Transforms a stream of deflate-raw-compressed text `DataStream_Chunk`s into a stream of
 * decompressed chunks, so `TextStreamReader` consumes it unchanged. Builds on
 * {@link inflateRawByteChunkStream} (single decompressor + ordering guard) and adds a streaming
 * `TextDecoder` that reframes the decompressed bytes on UTF-8 character boundaries (a write larger
 * than the MTU spans several packets, which may split a codepoint) so each synthesized chunk
 * decodes independently. Errors on the source stream propagate to the reader.
 */
function inflateRawChunkStream(
  raw: ReadableStream<DataStream_Chunk>,
  streamId: string,
): ReadableStream<DataStream_Chunk> {
  const byteReader = inflateRawByteChunkStream(raw, streamId).getReader();

  const decoder = new TextDecoder('utf-8', { fatal: true });
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

  const encoder = new TextEncoder();
  return new ReadableStream<DataStream_Chunk>({
    pull: async (controller) => {
      while (true) {
        const { done, value } = await byteReader.read();
        if (done) {
          const tail = decodeOrThrow();
          if (tail.length > 0) {
            controller.enqueue(makeChunk(streamId, outIndex, encoder.encode(tail)));
            outIndex += 1;
          }
          controller.close();
          return;
        }
        const text = decodeOrThrow(value.content);
        if (text.length > 0) {
          controller.enqueue(makeChunk(streamId, outIndex, encoder.encode(text)));
          outIndex += 1;
          return;
        }
        // Everything so far was a partial codepoint; keep pulling.
      }
    },
    cancel: (reason) => {
      byteReader.cancel(reason).catch(() => {});
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
