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
import { deflateRawDecompress, inflateRawTransform } from '../compression';
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

        // Determine if the byte payload needs to be decompressed.
        let compressed;
        switch (streamHeader.compression) {
          case DataStream_CompressionType.DEFLATE_RAW:
            if (!isCompressionStreamSupported()) {
              // NOTE: this shouldn't really ever happen, if this warning is logged then the sender
              // isn't properly abiding by the data streams v2 protocol.
              log.warn(
                `Data stream ${streamHeader.streamId} received with deflate-raw compression, but this browser does not have support for DecompressionStream. Dropping...`,
              );
              return;
            }
            compressed = true;
            break;
          case DataStream_CompressionType.NONE:
            compressed = false;
            break;
          default:
            // NOTE: this shouldn't really ever happen, if this warning is logged then the sender
            // isn't properly abiding by the data streams v2 protocol.
            log.warn(
              `Data stream ${streamHeader.streamId} received with unknown compression type ${streamHeader.compression}, dropping...`,
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

        // Determine if the byte payload needs to be decompressed.
        let compressed;
        switch (streamHeader.compression) {
          case DataStream_CompressionType.DEFLATE_RAW:
            if (!isCompressionStreamSupported()) {
              // NOTE: this shouldn't really ever happen, if this warning is logged then the sender
              // isn't properly abiding by the data streams v2 protocol.
              log.warn(
                `Data stream ${streamHeader.streamId} received with deflate-raw compression, but this browser does not have support for DecompressionStream. Dropping...`,
              );
              return;
            }
            compressed = true;
            break;
          case DataStream_CompressionType.NONE:
            compressed = false;
            break;
          default:
            // NOTE: this shouldn't really ever happen, if this warning is logged then the sender
            // isn't properly abiding by the data streams v2 protocol.
            log.warn(
              `Data stream ${streamHeader.streamId} received with unknown compression type ${streamHeader.compression}, dropping...`,
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
 * Validates that chunks are received in order, dropping duplicates and throwing if gaps are found.
 *
 * A stateful decompressor silently corrupts on duplicated or out-of-order input, so duplicates are
 * dropped (with a warning - in-order delivery is expected on the reliable channel, but reconnect
 * handling may replay) and a gap is a hard error. Shared by the text and byte deflate-raw decoders.
 */
function ensureOrderedChunks(
  streamId: string,
): TransformStream<DataStream_Chunk, DataStream_Chunk> {
  let lastChunkIndex = -1;
  return new TransformStream({
    transform: (value, controller) => {
      const index = bigIntToNumber(value.chunkIndex);
      if (index <= lastChunkIndex) {
        log.warn(
          `ignoring duplicate chunk ${index} for compressed data stream ${streamId} (last processed: ${lastChunkIndex})`,
        );
        return;
      }
      if (index > lastChunkIndex + 1) {
        throw new DataStreamError(
          `Missing chunk(s) ${lastChunkIndex + 1}..${index - 1} for compressed data stream ${streamId} - cannot continue decompressing`,
          DataStreamErrorReason.Incomplete,
        );
      }
      lastChunkIndex = index;
      controller.enqueue(value);
    },
  });
}

/** Unwraps compressed `DataStream_Chunk`s to their compressed bytes (in `chunkIndex` order), */
function chunksToBytes(): TransformStream<DataStream_Chunk, Uint8Array> {
  return new TransformStream({
    transform: (value, controller) => {
      controller.enqueue(value.content);
    },
  });
}

/** Re-wraps decompressed bytes into contiguous `DataStream_Chunk`s, skipping inflate's empty reads. */
function bytesToChunks(streamId: string): TransformStream<Uint8Array, DataStream_Chunk> {
  let outIndex = 0;
  return new TransformStream({
    transform: (value, controller) => {
      // Inflate can emit empty reads; only synthesize a chunk when there is content.
      if (value.byteLength > 0) {
        controller.enqueue(
          new DataStream_Chunk({
            streamId,
            chunkIndex: numberToBigInt(outIndex),
            content: value,
          }),
        );
        outIndex += 1;
      }
    },
  });
}

/**
 * Reframes decompressed byte chunks onto UTF-8 character boundaries via a streaming `TextDecoder`
 * (a write larger than the MTU spans several packets, which may split a codepoint), so each
 * synthesized text chunk decodes independently. The `flush` emits the decoder's trailing bytes.
 */
function bytesToDecodedUtf8(streamId: string): TransformStream<Uint8Array, DataStream_Chunk> {
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

  return new TransformStream({
    transform: (value, controller) => {
      const text = decodeOrThrow(value);
      // Everything so far may have been a partial codepoint; only emit once we have characters.
      if (text.length > 0) {
        controller.enqueue(
          new DataStream_Chunk({
            streamId,
            chunkIndex: numberToBigInt(outIndex),
            content: encoder.encode(text),
          }),
        );
        outIndex += 1;
      }
    },
    flush: (controller) => {
      const tail = decodeOrThrow();
      if (tail.length > 0) {
        controller.enqueue(
          new DataStream_Chunk({
            streamId,
            chunkIndex: numberToBigInt(outIndex),
            content: encoder.encode(tail),
          }),
        );
        outIndex += 1;
      }
    },
  });
}

/**
 * Transforms a stream of deflate-raw-compressed byte `DataStream_Chunk`s into a stream of
 * decompressed chunks, so `ByteStreamReader` consumes it unchanged. All chunk contents are fed (in
 * `chunkIndex` order) through ONE raw-deflate decompressor for the stream's lifetime; decompressed
 * output is re-wrapped as chunks as soon as it is produced. The sender (sendFile) compresses the
 * whole payload in one shot, but the format also supports a single context-takeover stream
 * sync-flushed at write boundaries, so a future incremental streamBytes could compress with no
 * protocol change. Errors and cancellation propagate through the pipe chain.
 */
function inflateRawByteChunkStream(
  raw: ReadableStream<DataStream_Chunk>,
  streamId: string,
): ReadableStream<DataStream_Chunk> {
  return raw
    .pipeThrough(ensureOrderedChunks(streamId))
    .pipeThrough(chunksToBytes())
    .pipeThrough(inflateRawTransform())
    .pipeThrough(bytesToChunks(streamId));
}

/**
 * Transforms a stream of deflate-raw-compressed text `DataStream_Chunk`s into a stream of
 * decompressed chunks, so `TextStreamReader` consumes it unchanged. Builds on
 * {@link inflateRawByteChunkStream} (single decompressor + ordering guard) and adds a streaming
 * `TextDecoder` that reframes the decompressed bytes on UTF-8 character boundaries so each
 * synthesized chunk decodes independently. Errors and cancellation propagate through the pipe chain.
 */
function inflateRawChunkStream(
  raw: ReadableStream<DataStream_Chunk>,
  streamId: string,
): ReadableStream<DataStream_Chunk> {
  return raw
    .pipeThrough(ensureOrderedChunks(streamId))
    .pipeThrough(chunksToBytes())
    .pipeThrough(inflateRawTransform())
    .pipeThrough(bytesToDecodedUtf8(streamId));
}
