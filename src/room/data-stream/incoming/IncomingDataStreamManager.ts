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
import { gzipDecompress, gzipDecompressStream } from '../compression';
import { COMPRESSION_ATTRIBUTE, COMPRESSION_GZIP, INLINE_PAYLOAD_ATTRIBUTE } from '../constants';
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

        const compressed = info.attributes![COMPRESSION_ATTRIBUTE] === COMPRESSION_GZIP;

        // Single-packet stream: the entire payload was smuggled into a reserved header attribute.
        // Synthesize an already-complete stream and skip waiting for chunk/trailer packets.
        const inlinePayload = streamHeader.attributes[INLINE_PAYLOAD_ATTRIBUTE];
        if (typeof inlinePayload !== 'undefined') {
          delete info.attributes![INLINE_PAYLOAD_ATTRIBUTE];
          delete info.attributes![COMPRESSION_ATTRIBUTE];
          // Compressed text is base64(gzip(utf-8)); uncompressed text is the raw string.
          const content = compressed
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
            compressed ? decompressedChunkStream(stream, streamHeader.streamId, 'text') : stream,
            // Compressed streams report no total length; completion is driven by the trailer.
            compressed ? undefined : bigIntToNumber(streamHeader.totalLength),
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
 * Transforms a raw stream of (compressed) `DataStream_Chunk`s into a stream of decompressed
 * `DataStream_Chunk`s, so the existing `ByteStreamReader`/`TextStreamReader` consume it unchanged.
 * For text, the decompressed bytes are reframed on UTF-8 character boundaries (via
 * `TextDecoderStream`) so each synthesized chunk decodes independently. Errors on the source stream
 * (e.g. encryption mismatch, abnormal end) propagate downstream to the reader.
 */
function decompressedChunkStream(
  raw: ReadableStream<DataStream_Chunk>,
  streamId: string,
  kind: 'byte' | 'text',
): ReadableStream<DataStream_Chunk> {
  const decompressed = gzipDecompressStream(chunkContentStream(raw)).getReader();
  // For text, reframe decompressed bytes on UTF-8 character boundaries (the decoder buffers partial
  // multibyte sequences across reads) and re-encode each whole-character fragment, so the reader's
  // per-chunk fatal decode always sees valid input.
  const decoder = kind === 'text' ? new TextDecoder() : undefined;
  const encoder = kind === 'text' ? new TextEncoder() : undefined;
  let chunkIndex = 0;

  return new ReadableStream<DataStream_Chunk>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await decompressed.read();
        if (done) {
          const tail = decoder?.decode();
          if (tail) {
            controller.enqueue(makeChunk(streamId, chunkIndex++, encoder!.encode(tail)));
          }
          controller.close();
          return;
        }
        const content = decoder ? encoder!.encode(decoder.decode(value, { stream: true })) : value;
        if (content.byteLength === 0) {
          continue; // partial multibyte char buffered; pull more
        }
        controller.enqueue(makeChunk(streamId, chunkIndex++, content));
        return;
      }
    },
    cancel: (reason) => {
      decompressed.cancel(reason);
    },
  });
}

/** Maps a stream of `DataStream_Chunk`s to a stream of their raw (compressed) `content` bytes. */
function chunkContentStream(raw: ReadableStream<DataStream_Chunk>): ReadableStream<Uint8Array> {
  const reader = raw.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(value.content);
    },
    cancel: (reason) => {
      reader.cancel(reason);
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
