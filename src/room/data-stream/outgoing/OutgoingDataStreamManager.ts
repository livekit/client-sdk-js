import { Mutex } from '@livekit/mutex';
import {
  DataPacket,
  DataStream_Chunk,
  DataStream_Trailer,
  Encryption_Type,
} from '@livekit/protocol';
import { type StructuredLogger } from '../../../logger';
import { CLIENT_PROTOCOL_DATA_STREAM_V2 } from '../../../version';
import type RTCEngine from '../../RTCEngine';
import { DataChannelKind } from '../../RTCEngine';
import { EngineEvent } from '../../events';
import type {
  ByteStreamInfo,
  SendFileOptions,
  SendTextOptions,
  StreamBytesOptions,
  StreamTextOptions,
  TextStreamInfo,
} from '../../types';
import { encodeBase64, isCompressionStreamSupported, numberToBigInt, splitUtf8 } from '../../utils';
import { deflateRawCompress, deflateRawCompressStream, gzipCompressStream } from '../compression';
import {
  COMPRESSION_ATTRIBUTE,
  COMPRESSION_DEFLATE_RAW,
  COMPRESSION_GZIP,
  INLINE_PAYLOAD_ATTRIBUTE,
  STREAM_CHUNK_SIZE_BYTES,
} from '../constants';
import { ByteStreamWriter, TextStreamWriter } from './StreamWriter';
import {
  buildByteStreamHeader,
  buildTextStreamHeader,
  createStreamHeaderPacket,
} from './header-utils';

const textEncoder = new TextEncoder();

/**
 * Manages sending custom user data via data channels.
 * @internal
 */
export default class OutgoingDataStreamManager {
  protected engine: RTCEngine;

  protected log: StructuredLogger;

  /** Returns the advertised client protocol of a remote participant, used to decide whether a
   * recipient can receive single-packet (inline) data streams. */
  protected getRemoteParticipantClientProtocol: (identity: string) => number;

  /** Returns the identities of every remote participant currently in the room, used to decide
   * whether a broadcast (no explicit destinations) can be sent inline. */
  protected getAllRemoteParticipantIdentities: () => Array<string>;

  constructor(
    engine: RTCEngine,
    log: StructuredLogger,
    getRemoteParticipantClientProtocol: (identity: string) => number,
    getAllRemoteParticipantIdentities: () => Array<string>,
  ) {
    this.engine = engine;
    this.log = log;
    this.getRemoteParticipantClientProtocol = getRemoteParticipantClientProtocol;
    this.getAllRemoteParticipantIdentities = getAllRemoteParticipantIdentities;
  }

  setupEngine(engine: RTCEngine) {
    this.engine = engine;
  }

  /** {@inheritDoc LocalParticipant.sendText} */
  async sendText(text: string, options?: SendTextOptions): Promise<TextStreamInfo> {
    const streamId = crypto.randomUUID();
    const textInBytes = textEncoder.encode(text);
    const totalTextLength = textInBytes.byteLength;
    const compress = options?.compress ?? true;

    // Fast path: when the full payload is known up front, there are no attachments, and the
    // payload fits (with header overhead) under the MTU, smuggle it into a reserved header
    // attribute and send a single `streamHeader` packet - no chunk/trailer packets.
    if (!options?.attachments || options.attachments.length === 0) {
      const inlineInfo = await this.trySendInlineText(streamId, text, totalTextLength, options);
      if (inlineInfo) {
        return inlineInfo;
      }
    }

    const fileIds = options?.attachments?.map(() => crypto.randomUUID());

    const progresses = new Array<number>(fileIds ? fileIds.length + 1 : 1).fill(0);

    const handleProgress = (progress: number, idx: number) => {
      progresses[idx] = progress;
      const totalProgress = progresses.reduce((acc, val) => acc + val, 0);
      options?.onProgress?.(totalProgress);
    };

    let info: TextStreamInfo;
    if (compress && this.shouldCompress(options?.destinationIdentities)) {
      // The full payload is known up front, so the chunked fallback can compress it in one shot
      // with the platform compressor (incremental writers can't compress; see streamText).
      info = await this.sendChunkedCompressedText(
        streamId,
        text,
        totalTextLength,
        fileIds,
        options,
      );
      // set text part of progress to 1
      handleProgress(1, 0);
    } else {
      const writer = await this.streamText({
        streamId,
        totalSize: totalTextLength,
        destinationIdentities: options?.destinationIdentities,
        topic: options?.topic,
        attachedStreamIds: fileIds,
        attributes: options?.attributes,
      });

      await writer.write(text);
      // set text part of progress to 1
      handleProgress(1, 0);

      await writer.close();
      info = writer.info;
    }

    if (options?.attachments && fileIds) {
      await Promise.all(
        options.attachments.map(async (file, idx) =>
          this._sendFile(fileIds[idx], file, {
            topic: options.topic,
            mimeType: file.type,
            onProgress: (progress) => {
              handleProgress(progress, idx + 1);
            },
          }),
        ),
      );
    }
    return info;
  }

  /**
   * Returns true only if every recipient is known to support data streams v2 (single-packet inline
   * streams and compression). For a targeted send this checks the named destination identities; for
   * a broadcast (no explicit destinations) it checks every remote participant currently in the room.
   * An empty room (nobody to receive) is considered eligible.
   */
  private allRecipientsSupportV2(destinationIdentities?: Array<string>): boolean {
    const identities =
      destinationIdentities && destinationIdentities.length > 0
        ? destinationIdentities
        : this.getAllRemoteParticipantIdentities();
    return identities.every(
      (identity) =>
        this.getRemoteParticipantClientProtocol(identity) >= CLIENT_PROTOCOL_DATA_STREAM_V2,
    );
  }

  /** Whether to compress a chunked stream: all recipients support v2 and the runtime can
   * compress. */
  private shouldCompress(destinationIdentities?: Array<string>): boolean {
    return this.allRecipientsSupportV2(destinationIdentities) && isCompressionStreamSupported();
  }

  /**
   * Attempts to send `text` as a single header packet with the payload smuggled into a reserved
   * attribute. Returns the resulting {@link TextStreamInfo} if it was sent inline, or `null` if the
   * caller should fall back to the regular chunked stream (recipient doesn't support data streams
   * v2, or the payload is too large to fit under the MTU).
   */
  private async trySendInlineText(
    streamId: string,
    text: string,
    totalTextLength: number,
    options?: SendTextOptions,
  ): Promise<TextStreamInfo | null> {
    if (!this.allRecipientsSupportV2(options?.destinationIdentities)) {
      return null;
    }

    const info: TextStreamInfo = {
      id: streamId,
      mimeType: 'text/plain',
      timestamp: Date.now(),
      topic: options?.topic ?? '',
      size: totalTextLength,
      attributes: options?.attributes,
      encryptionType: this.engine.e2eeManager?.isDataChannelEncryptionEnabled
        ? Encryption_Type.GCM
        : Encryption_Type.NONE,
    };

    // Compress when the runtime supports it, but only keep the result if it actually shrinks the
    // payload (deflate framing plus the base64 expansion makes tiny strings larger). Uncompressed
    // inline payloads stay as the raw string; compressed ones are base64'd and flagged via an
    // attribute.
    const inlineAttributes: Record<string, string> = {
      ...info.attributes,
      [INLINE_PAYLOAD_ATTRIBUTE]: text,
    };
    if (isCompressionStreamSupported()) {
      const raw = textEncoder.encode(text);
      const compressed = await deflateRawCompress(raw);
      if (compressed.byteLength < raw.byteLength) {
        inlineAttributes[INLINE_PAYLOAD_ATTRIBUTE] = encodeBase64(compressed);
        inlineAttributes[COMPRESSION_ATTRIBUTE] = COMPRESSION_DEFLATE_RAW;
      }
    }

    const header = buildTextStreamHeader({ ...info, attributes: inlineAttributes });
    const packet = createStreamHeaderPacket(header, options?.destinationIdentities);

    if (packet.toBinary().byteLength > STREAM_CHUNK_SIZE_BYTES) {
      return null;
    }

    await this.engine.sendDataPacket(packet, DataChannelKind.RELIABLE);
    options?.onProgress?.(1);
    return info;
  }

  /**
   * Sends `text` as a compressed chunked stream: one raw-deflate stream spanning every chunk
   * packet's content, terminated by the trailer. Used by the sendText fallback when the payload is
   * too large to send inline — the full payload is known up front, so the platform compressor
   * works even though it cannot flush mid-stream (the close is the only flush needed). Incremental
   * writers (streamText) cannot use this and send uncompressed instead.
   */
  private async sendChunkedCompressedText(
    streamId: string,
    text: string,
    totalTextLength: number,
    attachedStreamIds: Array<string> | undefined,
    options?: SendTextOptions,
  ): Promise<TextStreamInfo> {
    const destinationIdentities = options?.destinationIdentities;
    const engine = this.engine;

    const info: TextStreamInfo = {
      id: streamId,
      mimeType: 'text/plain',
      timestamp: Date.now(),
      topic: options?.topic ?? '',
      // Size is the pre-compression byte length; the receiver counts decompressed bytes against it.
      size: totalTextLength,
      attributes: { ...options?.attributes, [COMPRESSION_ATTRIBUTE]: COMPRESSION_DEFLATE_RAW },
      encryptionType: this.engine.e2eeManager?.isDataChannelEncryptionEnabled
        ? Encryption_Type.GCM
        : Encryption_Type.NONE,
      attachedStreamIds,
    };
    const header = buildTextStreamHeader(info);
    const packet = createStreamHeaderPacket(header, destinationIdentities);
    await engine.sendDataPacket(packet, DataChannelKind.RELIABLE);

    // Forward compressed output as it is produced, splitting at the MTU budget.
    let chunkId = 0;
    const reader = deflateRawCompressStream(textEncoder.encode(text)).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      let byteOffset = 0;
      while (byteOffset < value.byteLength) {
        const subChunk = value.slice(byteOffset, byteOffset + STREAM_CHUNK_SIZE_BYTES);
        const chunkPacket = new DataPacket({
          destinationIdentities,
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              content: subChunk,
              streamId,
              chunkIndex: numberToBigInt(chunkId),
            }),
          },
        });
        await engine.sendDataPacket(chunkPacket, DataChannelKind.RELIABLE);
        chunkId += 1;
        byteOffset += subChunk.byteLength;
      }
    }

    await sendStreamTrailer(streamId, destinationIdentities, engine);
    return info;
  }

  /**
   * @internal
   */
  async streamText(options?: StreamTextOptions): Promise<TextStreamWriter> {
    const streamId = options?.streamId ?? crypto.randomUUID();
    const destinationIdentities = options?.destinationIdentities;

    const info: TextStreamInfo = {
      id: streamId,
      mimeType: 'text/plain',
      timestamp: Date.now(),
      topic: options?.topic ?? '',
      size: options?.totalSize,
      attributes: options?.attributes,
      encryptionType: this.engine.e2eeManager?.isDataChannelEncryptionEnabled
        ? Encryption_Type.GCM
        : Encryption_Type.NONE,
      attachedStreamIds: options?.attachedStreamIds,
    };
    const header = buildTextStreamHeader(info, options);
    const packet = createStreamHeaderPacket(header, destinationIdentities);
    await this.engine.sendDataPacket(packet, DataChannelKind.RELIABLE);

    let chunkId = 0;
    const engine = this.engine;

    // Sends `bytes` as one or more streamChunk packets, splitting at the MTU budget. Writes are
    // already serialized by the WritableStream, so no extra locking is needed.
    const sendChunks = async (bytes: Uint8Array) => {
      let byteOffset = 0;
      while (byteOffset < bytes.byteLength) {
        const subChunk = bytes.slice(byteOffset, byteOffset + STREAM_CHUNK_SIZE_BYTES);
        const chunkPacket = new DataPacket({
          destinationIdentities,
          value: {
            case: 'streamChunk',
            value: new DataStream_Chunk({
              content: subChunk,
              streamId,
              chunkIndex: numberToBigInt(chunkId),
            }),
          },
        });
        await engine.sendDataPacket(chunkPacket, DataChannelKind.RELIABLE);
        chunkId += 1;
        byteOffset += subChunk.byteLength;
      }
    };

    const writableStream = new WritableStream<string>({
      async write(text) {
        // Incremental writers are never compressed (the platform compressor cannot flush
        // mid-stream, and per-write flushing costs more than it saves at typical write sizes —
        // see sendChunkedCompressedText for the one-shot compressed path). Split each write on
        // UTF-8 boundaries so every chunk decodes independently on the receiver.
        for (const textByteChunk of splitUtf8(text, STREAM_CHUNK_SIZE_BYTES)) {
          await sendChunks(textByteChunk);
        }
      },
      async close() {
        await sendStreamTrailer(streamId, destinationIdentities, engine);
      },
      abort(err) {
        console.log('Sink error:', err);
        // TODO handle aborts to signal something to receiver side
      },
    });

    let onEngineClose = async () => {
      await writer.close();
    };

    // FIXME: make this a global event to ensure "max listener" warning won't get logged for lots of
    // in flight data streams.
    engine.once(EngineEvent.Closing, onEngineClose);

    const writer = new TextStreamWriter(writableStream, info, () =>
      this.engine.off(EngineEvent.Closing, onEngineClose),
    );

    return writer;
  }

  async sendFile(file: File, options?: SendFileOptions): Promise<{ id: string }> {
    const streamId = crypto.randomUUID();
    await this._sendFile(streamId, file, options);
    return { id: streamId };
  }

  private async _sendFile(streamId: string, file: File, options?: SendFileOptions) {
    const writer = await this.streamBytes({
      streamId,
      totalSize: file.size,
      name: file.name,
      mimeType: options?.mimeType ?? file.type,
      topic: options?.topic,
      destinationIdentities: options?.destinationIdentities,
    });
    const reader = file.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      await writer.write(value);
    }
    await writer.close();
    return writer.info;
  }

  async streamBytes(options?: StreamBytesOptions) {
    const streamId = options?.streamId ?? crypto.randomUUID();
    const destinationIdentities = options?.destinationIdentities;
    const compressOption =
      options?.compress ??
      (typeof options?.totalSize === 'number' && options.totalSize > 2_000) /* bytes */;
    const compress = compressOption && this.shouldCompress(destinationIdentities);

    const info: ByteStreamInfo = {
      id: streamId,
      mimeType: options?.mimeType ?? 'application/octet-stream',
      topic: options?.topic ?? '',
      timestamp: Date.now(),
      attributes: compress
        ? { ...options?.attributes, [COMPRESSION_ATTRIBUTE]: COMPRESSION_GZIP }
        : options?.attributes,
      // Compressed streams have an unknown total length up front; left undefined (see receiver).
      //
      // FIXME: make this instead the size before compression maybe?
      size: compress ? undefined : options?.totalSize,
      name: options?.name ?? 'unknown',
      encryptionType: this.engine.e2eeManager?.isDataChannelEncryptionEnabled
        ? Encryption_Type.GCM
        : Encryption_Type.NONE,
    };

    const header = buildByteStreamHeader(info);
    const packet = createStreamHeaderPacket(header, destinationIdentities);

    await this.engine.sendDataPacket(packet, DataChannelKind.RELIABLE);

    let chunkId = 0;
    const writeMutex = new Mutex();
    const engine = this.engine;
    const logLocal = this.log;

    const writableStream = compress
      ? createCompressedChunkWritable<Uint8Array>(
          streamId,
          destinationIdentities,
          engine,
          (chunk) => chunk,
        )
      : new WritableStream<Uint8Array>({
          async write(chunk) {
            const unlock = await writeMutex.lock();

            let byteOffset = 0;
            try {
              while (byteOffset < chunk.byteLength) {
                const subChunk = chunk.slice(byteOffset, byteOffset + STREAM_CHUNK_SIZE_BYTES);
                const chunkPacket = new DataPacket({
                  destinationIdentities,
                  value: {
                    case: 'streamChunk',
                    value: new DataStream_Chunk({
                      content: subChunk,
                      streamId,
                      chunkIndex: numberToBigInt(chunkId),
                    }),
                  },
                });
                await engine.sendDataPacket(chunkPacket, DataChannelKind.RELIABLE);
                chunkId += 1;
                byteOffset += subChunk.byteLength;
              }
            } finally {
              unlock();
            }
          },
          async close() {
            await sendStreamTrailer(streamId, destinationIdentities, engine);
          },
          abort(err) {
            logLocal.error('Sink error:', err);
          },
        });

    const byteWriter = new ByteStreamWriter(writableStream, info);

    return byteWriter;
  }
}

/** Sends a `streamTrailer` packet, marking the end of a stream. */
async function sendStreamTrailer(
  streamId: string,
  destinationIdentities: Array<string> | undefined,
  engine: RTCEngine,
): Promise<void> {
  const trailerPacket = new DataPacket({
    destinationIdentities,
    value: { case: 'streamTrailer', value: new DataStream_Trailer({ streamId }) },
  });
  await engine.sendDataPacket(trailerPacket, DataChannelKind.RELIABLE);
}

/**
 * Builds a `WritableStream` whose writes are gzip-compressed and emitted as `streamChunk` packets,
 * followed by a `streamTrailer` on close. Each `write()` is compressed into its own gzip member and
 * its compressed bytes are split into `STREAM_CHUNK_SIZE_BYTES` pieces sent immediately — including a
 * final partial piece — so a write's data is delivered without waiting to fill a chunk or for the
 * stream to close (low latency for incremental senders). The receiver decompresses the concatenation
 * of members (a valid multi-member gzip stream), so this is only used for recipients that understand
 * compressed streams.
 */
function createCompressedChunkWritable<T>(
  streamId: string,
  destinationIdentities: Array<string> | undefined,
  engine: RTCEngine,
  encode: (chunk: T) => Uint8Array,
): WritableStream<T> {
  let chunkId = 0;
  // Each write() is compressed into its own gzip member. Browsers' DecompressionStream only accepts a
  // single member per gzip stream, so we tag every chunk with its member index (in the chunk's spare
  // `version` field); the receiver segments on it and decompresses each member independently.
  let memberId = 0;

  const sendChunk = async (content: Uint8Array, version: number) => {
    const chunkPacket = new DataPacket({
      destinationIdentities,
      value: {
        case: 'streamChunk',
        value: new DataStream_Chunk({
          content: content as NonSharedUint8Array,
          streamId,
          chunkIndex: numberToBigInt(chunkId),
          version,
        }),
      },
    });
    await engine.sendDataPacket(chunkPacket, DataChannelKind.RELIABLE);
    chunkId += 1;
  };

  return new WritableStream<T>({
    async write(chunk) {
      const member = memberId;
      memberId += 1;
      const reader = gzipCompressStream(encode(chunk)).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        await Promise.all(
          new Array(Math.ceil(value.length / STREAM_CHUNK_SIZE_BYTES)).fill(null).map((_, i) => {
            return sendChunk(
              value.slice(i * STREAM_CHUNK_SIZE_BYTES, (i + 1) * STREAM_CHUNK_SIZE_BYTES),
              member,
            );
          }),
        );
      }
    },
    async close() {
      await sendStreamTrailer(streamId, destinationIdentities, engine);
    },
    abort() {
      // Each write compresses independently, so there is no persistent compressor to tear down.
    },
  });
}
