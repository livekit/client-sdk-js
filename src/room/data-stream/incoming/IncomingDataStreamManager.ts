import {
  type DataPacket,
  DataStream_Chunk,
  DataStream_CompressionType,
  DataStream_Header,
  DataStream_Trailer,
  Encryption_Type,
} from '@livekit/protocol';
import { EventEmitter } from 'events';
import type TypedEmitter from 'typed-emitter';
import log from '../../../logger';
import { type RoomDataStreamOptions } from '../../../options';
import { type NonSharedUint8Array } from '../../../type-polyfills/non-shared-typed-arrays';
import { DataStreamError, DataStreamErrorReason } from '../../errors';
import { type ByteStreamInfo, type StreamController, type TextStreamInfo } from '../../types';
import { bigIntToNumber, isDeflateRawCompressionSupported, numberToBigInt } from '../../utils';
import { deflateRawDecompress, inflateRawTransform } from '../compression';
import {
  DEFAULT_MAX_OPEN_STREAMS_PER_PARTICIPANT,
  DEFAULT_MAX_PAYLOAD_BYTE_LENGTH,
  MAX_OPEN_PER_PARTICIPANT_ERROR_LOG_THROTTLE,
  TRANSCRIPTION_TOPIC,
} from '../constants';
import {
  type ByteStreamHandler,
  ByteStreamReader,
  type TextStreamHandler,
  TextStreamReader,
} from './StreamReader';
import type { IncomingDataStreamManagerCallbacks } from './events';

/**
 * The receive state for one in-flight text stream. A text stream can have several consumers (an
 * application handler for its topic, plus the SDK's own transcription tap), each reading through
 * its own `ReadableStream`. Everything that describes the *stream* - its info, when it started, who
 * sent it - is held once here rather than copied per consumer, so consumers cannot disagree about
 * it and a trailer's attribute merge is visible to all of them by construction.
 */
type TextStreamControllerGroup = Omit<StreamController<DataStream_Chunk>, 'info' | 'controller'> & {
  info: TextStreamInfo;
  /** The controller of each underlying {@link ReadableStream} which is currently being fed by this text stream. */
  controllers: Array<ReadableStreamDefaultController<DataStream_Chunk>>;
};

/** An open stream: one controller for a byte stream, a group of them for a text stream. */
type OpenStream = StreamController<DataStream_Chunk> | TextStreamControllerGroup;

function controllersOf(stream: OpenStream) {
  return 'controllers' in stream ? stream.controllers : [stream.controller];
}

export default class IncomingDataStreamManager extends (EventEmitter as new () => TypedEmitter<IncomingDataStreamManagerCallbacks>) {
  private log = log;

  /** Max number of decompressed bytes an incoming compressed stream may produce before it is
   * errored (decompression-bomb guard). */
  private maxPayloadByteLength: number;

  /** Max number of incoming streams a single remote participant may have open at once. */
  private maxOpenStreamsPerParticipant: number;

  /**
   * Whether `identity` may send a stream on behalf of another participant, i.e. may claim a
   * stream whose header the SFU forwarded under someone else's identity.
   */
  private canSendStreamOnOthersBehalf: (identity: string) => boolean;

  constructor(
    {
      maxPayloadByteLength = DEFAULT_MAX_PAYLOAD_BYTE_LENGTH,
      maxOpenStreamsPerParticipant = DEFAULT_MAX_OPEN_STREAMS_PER_PARTICIPANT,
    }: RoomDataStreamOptions = {},
    canSendStreamOnOthersBehalf: (identity: string) => boolean = () => false,
  ) {
    super();
    this.maxPayloadByteLength = maxPayloadByteLength;
    this.maxOpenStreamsPerParticipant = maxOpenStreamsPerParticipant;
    this.canSendStreamOnOthersBehalf = canSendStreamOnOthersBehalf;
  }

  private byteStreamControllers = new Map<string, StreamController<DataStream_Chunk>>();

  private textStreamControllers = new Map<string, TextStreamControllerGroup>();

  /**
   * Number of open byte and text streams per sender, kept alongside the controller maps so the
   * per-participant limit is a single lookup rather than a scan of every open stream. Only
   * {@link addStream} and {@link removeStream} change it; a sender's entry is removed when its
   * count reaches zero.
   */
  private openStreamCounts = new Map<string, number>();

  /** Headers dropped so far for being over the per-participant open-stream limit. */
  private droppedOverLimitCount = 0;

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
    // Error any in flight streams so readers do not wait forever for chunks that can no longer arrive.
    const abnormalEndError = new DataStreamError(
      'Room disconnected in the middle of receiving data',
      DataStreamErrorReason.AbnormalEnd,
    );
    for (const { controller } of this.byteStreamControllers.values()) {
      controller.error(abnormalEndError);
    }
    for (const { controllers } of this.textStreamControllers.values()) {
      for (const controller of controllers) {
        controller.error(abnormalEndError);
      }
    }
    this.byteStreamControllers.clear();
    this.textStreamControllers.clear();
    this.openStreamCounts.clear();
    this.bufferedPackets = [];
  }

  validateParticipantHasNoActiveDataStreams(participantIdentity: string) {
    // Terminate any in flight data stream receives from the given participant
    // A stream is affected if it is attributed to the participant, or if the participant is
    // sending it on someone else's behalf.
    const isAffected = ([, streamController]: [string, OpenStream]) =>
      streamController.sendingParticipantIdentity === participantIdentity ||
      streamController.packetSenderIdentity === participantIdentity;
    const textStreamsBeingSentByDisconnectingParticipant = Array.from(
      this.textStreamControllers.entries(),
    ).filter(isAffected);
    const byteStreamsBeingSentByDisconnectingParticipant = Array.from(
      this.byteStreamControllers.entries(),
    ).filter(isAffected);

    if (
      textStreamsBeingSentByDisconnectingParticipant.length > 0 ||
      byteStreamsBeingSentByDisconnectingParticipant.length > 0
    ) {
      const abnormalEndError = new DataStreamError(
        `Participant ${participantIdentity} unexpectedly disconnected in the middle of sending data`,
        DataStreamErrorReason.AbnormalEnd,
      );
      for (const [id, streamController] of byteStreamsBeingSentByDisconnectingParticipant) {
        streamController.controller.error(abnormalEndError);
        this.removeStream(this.byteStreamControllers, id);
      }
      for (const [id, streamController] of textStreamsBeingSentByDisconnectingParticipant) {
        for (const controller of streamController.controllers) {
          controller.error(abnormalEndError);
        }
        this.removeStream(this.textStreamControllers, id);
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
        return this.handleStreamChunk(
          packet.value.value,
          packet.participantIdentity,
          encryptionType,
        );
      case 'streamTrailer':
        return this.handleStreamTrailer(
          packet.value.value,
          packet.participantIdentity,
          encryptionType,
        );
      default:
        throw new Error(`DataPacket of value "${packet.value.case}" is not data stream related!`);
    }
  }

  /**
   * Returns the number of byte and text streams the given participant currently has open.
   *
   * @internal
   */
  getOpenStreamCount(participantIdentity: string) {
    return this.openStreamCounts.get(participantIdentity) ?? 0;
  }

  /**
   * Registers an open stream and counts it against its sender. Every insertion into a controller
   * map goes through here so {@link openStreamCounts} cannot drift.
   */
  private addStream<T extends OpenStream>(
    streamControllers: Map<string, T>,
    streamId: string,
    streamController: T,
  ) {
    streamControllers.set(streamId, streamController);
    const { sendingParticipantIdentity } = streamController;
    this.openStreamCounts.set(
      sendingParticipantIdentity,
      this.getOpenStreamCount(sendingParticipantIdentity) + 1,
    );
  }

  /**
   * Unregisters an open stream and uncounts it from its sender. Every single-stream removal goes
   * through here so {@link openStreamCounts} cannot drift. The count is keyed by the identity the
   * stream was registered under, never by the identity on the packet that ends it.
   */
  private removeStream(streamControllers: Map<string, OpenStream>, streamId: string) {
    const streamController = streamControllers.get(streamId);
    if (!streamController) {
      return;
    }
    streamControllers.delete(streamId);
    const { sendingParticipantIdentity } = streamController;
    const count = this.getOpenStreamCount(sendingParticipantIdentity) - 1;
    if (count > 0) {
      this.openStreamCounts.set(sendingParticipantIdentity, count);
    } else {
      this.openStreamCounts.delete(sendingParticipantIdentity);
    }
  }

  private handleStreamHeader(
    streamHeader: DataStream_Header,
    participantIdentity: string,
    encryptionType: Encryption_Type,
  ) {
    if (this.getOpenStreamCount(participantIdentity) >= this.maxOpenStreamsPerParticipant) {
      // Logs the first drop, then every `MAX_OPEN_PER_PARTICIPANT_ERROR_LOG_THROTTLE`th.
      if (this.droppedOverLimitCount % MAX_OPEN_PER_PARTICIPANT_ERROR_LOG_THROTTLE === 0) {
        this.log.error(
          `Participant ${participantIdentity} already has ${this.maxOpenStreamsPerParticipant} data streams open, dropping stream ${streamHeader.streamId} (${this.droppedOverLimitCount + 1} dropped over the limit so far)`,
        );
      }
      this.droppedOverLimitCount += 1;
      return;
    }

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
            if (!isDeflateRawCompressionSupported()) {
              // NOTE: this shouldn't really ever happen, if this warning is logged then the sender
              // isn't properly abiding by the data streams v2 protocol.
              log.warn(
                `Data stream ${streamHeader.streamId} received with deflate-raw compression, but this browser does not support deflate-raw decompression. Dropping...`,
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
        const inlineContent = streamHeader.inlineContent as NonSharedUint8Array;
        if (typeof inlineContent !== 'undefined') {
          // Inline bytes are the raw payload, optionally deflate-raw compressed.
          streamHandlerCallback(
            new ByteStreamReader(
              info,
              createInlineStream(
                streamHeader.streamId,
                compressed
                  ? deflateRawDecompress(inlineContent, this.maxPayloadByteLength)
                  : inlineContent,
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

            if (this.byteStreamControllers.has(streamHeader.streamId)) {
              throw new DataStreamError(
                `A data stream read is already in progress for a stream with id ${streamHeader.streamId}.`,
                DataStreamErrorReason.AlreadyOpened,
              );
            }

            this.addStream(this.byteStreamControllers, streamHeader.streamId, {
              info,
              controller: streamController,
              startTime: Date.now(),
              sendingParticipantIdentity: participantIdentity,
              // The SFU never keeps a claimed identity on a byte header, so its chunks and
              // trailer carry the same identity.
              packetSenderIdentity: participantIdentity,
            });
          },
          cancel: () => {
            // The consumer side of the pipe chain errored (e.g. `ensureOrderedChunks` saw a gap) or
            // was cancelled, which cancels this source stream. Unregister it so later chunks and the
            // trailer for this stream are dropped rather than hitting a closed controller.
            if (
              this.byteStreamControllers.get(streamHeader.streamId)?.controller === streamController
            ) {
              this.removeStream(this.byteStreamControllers, streamHeader.streamId);
            }
          },
        });
        streamHandlerCallback(
          new ByteStreamReader(
            info,
            compressed
              ? inflateRawByteChunkStream(stream, streamHeader.streamId, this.maxPayloadByteLength)
              : stream.pipeThrough(ensureOrderedChunks(streamHeader.streamId)),
            // `totalLength` is the pre-compression size, and the reader counts decompressed bytes,
            // so it applies to both paths (mirrors text).
            bigIntToNumber(streamHeader.totalLength),
          ),
          {
            identity: participantIdentity,
          },
        );
        return;
      }
      case 'textHeader': {
        // The transcription tap runs alongside the application handler, each with its own reader,
        // so the SDK can rebuild transcription events without taking the reserved topic away from
        // an application that reads it too. `listenerCount` keeps the "nobody wants this stream,
        // drop it" behavior intact when no one has subscribed.
        const streamHandlerCallbacks: Array<TextStreamHandler> = [];
        if (
          streamHeader.topic === TRANSCRIPTION_TOPIC &&
          this.listenerCount('transcriptionStreamArrived') > 0
        ) {
          streamHandlerCallbacks.push((reader, { identity }) => {
            this.emit('transcriptionStreamArrived', { reader, participantIdentity: identity });
          });
        }
        const applicationCallback = this.textStreamHandlers.get(streamHeader.topic);
        if (applicationCallback) {
          streamHandlerCallbacks.push(applicationCallback);
        }
        if (streamHandlerCallbacks.length === 0) {
          this.log.debug(
            'ignoring incoming text stream due to no handler for topic',
            streamHeader.topic,
          );
          return;
        }

        // The SFU marks a text header `generated` when it was sent under another participant's
        // identity (today only an agent may do this).
        const isOnBehalfOf = streamHeader.contentHeader.value.generated;

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
            if (!isDeflateRawCompressionSupported()) {
              // NOTE: this shouldn't really ever happen, if this warning is logged then the sender
              // isn't properly abiding by the data streams v2 protocol.
              log.warn(
                `Data stream ${streamHeader.streamId} received with deflate-raw compression, but this browser does not support deflate-raw decompression. Dropping...`,
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
        const inlineContent = streamHeader.inlineContent as NonSharedUint8Array;
        if (typeof inlineContent !== 'undefined') {
          // Inline text is the raw UTF-8 payload, optionally deflate-raw compressed. `content` is
          // computed once and shared: when compressed it is a promise, so each inline stream awaits
          // the same decompression rather than repeating it.
          const content = compressed
            ? deflateRawDecompress(inlineContent, this.maxPayloadByteLength)
            : inlineContent;
          for (const streamHandlerCallback of streamHandlerCallbacks) {
            streamHandlerCallback(
              new TextStreamReader(
                info,
                createInlineStream(streamHeader.streamId, content),
                bigIntToNumber(streamHeader.totalLength),
              ),
              { identity: participantIdentity },
            );
          }
          return;
        }

        if (this.textStreamControllers.has(streamHeader.streamId)) {
          throw new DataStreamError(
            `A data stream read is already in progress for a stream with id ${streamHeader.streamId}.`,
            DataStreamErrorReason.AlreadyOpened,
          );
        }

        const group: TextStreamControllerGroup = {
          info,
          startTime: Date.now(),
          sendingParticipantIdentity: participantIdentity,
          // A `generated` header was sent on this participant's behalf; its real sender claims the
          // stream with its first chunk or trailer.
          packetSenderIdentity: isOnBehalfOf ? undefined : participantIdentity,
          controllers: [],
        };
        this.addStream(this.textStreamControllers, streamHeader.streamId, group);

        for (const streamHandlerCallback of streamHandlerCallbacks) {
          let streamController: ReadableStreamDefaultController<DataStream_Chunk>;
          const stream = new ReadableStream<DataStream_Chunk>({
            start: (controller) => {
              streamController = controller;
              group.controllers.push(controller);
            },
            cancel: () => {
              // This consumer's side of the pipe chain errored (e.g. `ensureOrderedChunks` saw a
              // gap) or was cancelled, which cancels this source stream. Drop its controller so later
              // chunks and the trailer skip it rather than hitting a closed controller, and
              // unregister the stream once no consumers remain.
              const index = group.controllers.indexOf(streamController);
              if (index !== -1) {
                group.controllers.splice(index, 1);
              }
              if (
                group.controllers.length === 0 &&
                this.textStreamControllers.get(streamHeader.streamId) === group
              ) {
                this.removeStream(this.textStreamControllers, streamHeader.streamId);
              }
            },
          });
          streamHandlerCallback(
            new TextStreamReader(
              info,
              compressed
                ? inflateRawChunkStream(stream, streamHeader.streamId, this.maxPayloadByteLength)
                : stream.pipeThrough(ensureOrderedChunks(streamHeader.streamId)),
              // `totalLength` is the pre-compression size, and the reader sees decompressed bytes,
              // so it applies to both paths.
              bigIntToNumber(streamHeader.totalLength),
            ),
            { identity: participantIdentity },
          );
        }
        return;
      }
    }
  }

  /**
   * Checks that a chunk or trailer may act on the stream it names, given that stream's (already
   * looked up) controller.
   *
   * Stream ids key the controller maps globally, so a packet naming an open id reaches that stream
   * whoever sent it. Without the sender check, a participant that learns an id (every recipient of
   * a multi-destination stream learns it from the header) could append to another participant's
   * stream, merge its own attributes in, or end it with a forged reason. A packet from the wrong
   * sender is logged and dropped on its own: erroring the stream instead would let a third party
   * cancel someone else's stream.
   *
   * The sender a stream accepts is its `packetSenderIdentity`, see {@link StreamController}. For a
   * stream sent on someone else's behalf it is unset until the first chunk or trailer arrives from
   * a participant that {@link canSendStreamOnOthersBehalf}; that participant claims the stream, and
   * from then on only its packets are accepted. The identity on chunks and trailers is the one the
   * SFU asserted, so the claim cannot be made under a borrowed identity, and only a participant
   * allowed to send on others' behalf can make it, so an ordinary participant that saw the header
   * cannot take the stream over.
   *
   * The encryption check likewise stops an unencrypted peer from writing into (or cleanly closing)
   * an encrypted stream; that one does error the stream, see {@link handleStreamPacketError}.
   *
   * @returns whether the packet may be applied; `false` means it was dropped.
   * @throws {DataStreamError} `EncryptionTypeMismatch`.
   */
  private validateStreamPacket(
    streamId: string,
    streamController: OpenStream,
    participantIdentity: string,
    encryptionType: Encryption_Type,
  ): boolean {
    if (
      streamController.packetSenderIdentity === undefined &&
      this.canSendStreamOnOthersBehalf(participantIdentity)
    ) {
      streamController.packetSenderIdentity = participantIdentity;
    }
    if (streamController.packetSenderIdentity !== participantIdentity) {
      const owner =
        streamController.packetSenderIdentity ??
        `a participant sending on behalf of ${streamController.sendingParticipantIdentity}`;
      this.log.warn(
        `Dropping data stream packet for ${streamId} from ${participantIdentity}: stream belongs to ${owner}`,
      );
      return false;
    }
    if (streamController.info.encryptionType !== encryptionType) {
      throw new DataStreamError(
        `Encryption type mismatch for stream ${streamId}. Expected ${streamController.info.encryptionType}, got ${encryptionType}`,
        DataStreamErrorReason.EncryptionTypeMismatch,
      );
    }
    return true;
  }

  /**
   * Handles an error thrown while applying a chunk or trailer to an open stream: a
   * `DataStreamError` errors the stream and unregisters it.
   */
  private handleStreamPacketError(
    error: unknown,
    streamId: string,
    streamController: OpenStream,
    streamControllers: Map<string, OpenStream>,
  ) {
    if (!(error instanceof DataStreamError)) {
      throw error;
    }
    for (const controller of controllersOf(streamController)) {
      controller.error(error);
    }
    this.removeStream(streamControllers, streamId);
  }

  private handleStreamChunk(
    chunk: DataStream_Chunk,
    participantIdentity: string,
    encryptionType: Encryption_Type,
  ) {
    const bytesBuffer = this.byteStreamControllers.get(chunk.streamId);
    if (bytesBuffer) {
      try {
        if (
          this.validateStreamPacket(
            chunk.streamId,
            bytesBuffer,
            participantIdentity,
            encryptionType,
          )
        ) {
          bytesBuffer.controller.enqueue(chunk);
        }
      } catch (error) {
        this.handleStreamPacketError(
          error,
          chunk.streamId,
          bytesBuffer,
          this.byteStreamControllers,
        );
      }
    }
    const textBuffer = this.textStreamControllers.get(chunk.streamId);
    if (textBuffer) {
      try {
        if (
          this.validateStreamPacket(chunk.streamId, textBuffer, participantIdentity, encryptionType)
        ) {
          for (const controller of textBuffer.controllers) {
            controller.enqueue(chunk);
          }
        }
      } catch (error) {
        this.handleStreamPacketError(error, chunk.streamId, textBuffer, this.textStreamControllers);
      }
    }
  }

  private handleStreamTrailer(
    trailer: DataStream_Trailer,
    participantIdentity: string,
    encryptionType: Encryption_Type,
  ) {
    // Validated before the attribute merge and the close below, so a rejected trailer can neither
    // inject attributes nor end the stream.
    const textBuffer = this.textStreamControllers.get(trailer.streamId);
    if (textBuffer) {
      try {
        if (
          this.validateStreamPacket(
            trailer.streamId,
            textBuffer,
            participantIdentity,
            encryptionType,
          )
        ) {
          // One `info` per stream, so this merge is visible to every consumer's reader.
          textBuffer.info.attributes = {
            ...textBuffer.info.attributes,
            ...trailer.attributes,
          };
          if (trailer.reason) {
            // A non-empty reason marks an abnormal close by the sender (e.g. an aborted send);
            // surface it as an error rather than pretending the stream completed.
            const error = new DataStreamError(
              `Data stream ${trailer.streamId} closed abnormally: ${trailer.reason}`,
              DataStreamErrorReason.AbnormalEnd,
            );
            for (const controller of textBuffer.controllers) {
              controller.error(error);
            }
          } else {
            for (const controller of textBuffer.controllers) {
              controller.close();
            }
          }
          this.removeStream(this.textStreamControllers, trailer.streamId);
        }
      } catch (error) {
        this.handleStreamPacketError(
          error,
          trailer.streamId,
          textBuffer,
          this.textStreamControllers,
        );
      }
    }

    const bytesBuffer = this.byteStreamControllers.get(trailer.streamId);
    if (bytesBuffer) {
      try {
        if (
          this.validateStreamPacket(
            trailer.streamId,
            bytesBuffer,
            participantIdentity,
            encryptionType,
          )
        ) {
          bytesBuffer.info.attributes = {
            ...bytesBuffer.info.attributes,
            ...trailer.attributes,
          };
          if (trailer.reason) {
            // A non-empty reason marks an abnormal close by the sender (e.g. an aborted send);
            // surface it as an error rather than pretending the stream completed.
            bytesBuffer.controller.error(
              new DataStreamError(
                `Data stream ${trailer.streamId} closed abnormally: ${trailer.reason}`,
                DataStreamErrorReason.AbnormalEnd,
              ),
            );
          } else {
            bytesBuffer.controller.close();
          }
          this.removeStream(this.byteStreamControllers, trailer.streamId);
        }
      } catch (error) {
        this.handleStreamPacketError(
          error,
          trailer.streamId,
          bytesBuffer,
          this.byteStreamControllers,
        );
      }
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
      const bytes = await content;
      controller.enqueue(new DataStream_Chunk({ streamId, chunkIndex: BigInt(0), content: bytes }));
      controller.close();
    },
  });
}

/**
 * Validates that chunks are received in order, dropping duplicates and throwing if gaps are found.
 *
 * Reassembly (and, for compressed streams, a stateful decompressor) silently corrupts on duplicated
 * or out-of-order input, so duplicates are dropped (with a warning - in-order delivery is expected
 * on the reliable channel, but reconnect handling may replay) and a gap is a hard error. Empty
 * chunks consume their index and are then dropped, so they never reach the reader. Applied to every
 * chunked stream, compressed or not.
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
          `ignoring duplicate chunk ${index} ${value.version > 0 ? `(version ${value.version})` : ''} for data stream ${streamId} (last processed: ${lastChunkIndex})`,
        );
        return;
      }
      if (index > lastChunkIndex + 1) {
        throw new DataStreamError(
          `Missing chunk(s) ${lastChunkIndex + 1}..${index - 1} for data stream ${streamId} - cannot reassemble payload`,
          DataStreamErrorReason.Incomplete,
        );
      }
      lastChunkIndex = index;
      if (value.content.length === 0) {
        return;
      }
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
  const decoder = new TextDecoder('utf-8');
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
  maxPayloadByteLength: number,
): ReadableStream<DataStream_Chunk> {
  return raw
    .pipeThrough(ensureOrderedChunks(streamId))
    .pipeThrough(chunksToBytes())
    .pipeThrough(inflateRawTransform())
    .pipeThrough(maxDecompressedLengthGuard(streamId, maxPayloadByteLength))
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
  maxPayloadByteLength: number,
): ReadableStream<DataStream_Chunk> {
  return raw
    .pipeThrough(ensureOrderedChunks(streamId))
    .pipeThrough(chunksToBytes())
    .pipeThrough(inflateRawTransform())
    .pipeThrough(maxDecompressedLengthGuard(streamId, maxPayloadByteLength))
    .pipeThrough(bytesToDecodedUtf8(streamId));
}

/**
 * Caps the total decompressed byte count of a compressed stream (decompression-bomb guard): a
 * tiny compressed payload can inflate to an arbitrarily large output, so the decompressor's
 * output is bounded rather than trusting the wire size. Exceeding the cap errors the stream with
 * `PayloadTooLarge`.
 */
function maxDecompressedLengthGuard(
  streamId: string,
  maxByteLength: number,
): TransformStream<Uint8Array, Uint8Array> {
  let total = 0;
  return new TransformStream({
    transform: (value, controller) => {
      total += value.byteLength;
      if (total > maxByteLength) {
        throw new DataStreamError(
          `Data stream ${streamId} exceeds the maximum payload size of ${maxByteLength} bytes`,
          DataStreamErrorReason.PayloadTooLarge,
        );
      }
      controller.enqueue(value);
    },
  });
}
