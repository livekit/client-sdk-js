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
import {
  encodeBase64,
  isCompressionStreamSupported,
  numberToBigInt,
  readBytesInChunks,
  readableFromBytes,
  splitUtf8,
} from '../../utils';
import { deflateRawCompress, deflateRawCompressReadable } from '../compression';
import {
  COMPRESSION_ATTRIBUTE,
  COMPRESSION_DEFLATE_RAW,
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

    let info: TextStreamInfo = {
      id: streamId,
      mimeType: 'text/plain',
      timestamp: Date.now(),
      topic: options?.topic ?? '',
      size: totalTextLength, // NOTE: size is always the pre-compression byte length
      attributes: options?.attributes,
      encryptionType: this.engine.e2eeManager?.isDataChannelEncryptionEnabled
        ? Encryption_Type.GCM
        : Encryption_Type.NONE,
    };

    // Phase 1: Try to send as a single packet data stream
    const noAttachments = !options?.attachments || options.attachments.length === 0;
    if (noAttachments && this.allRecipientsSupportV2(options?.destinationIdentities)) {
      // Compress when the runtime supports it, but only keep the result if it actually shrinks the
      // payload (deflate framing plus the base64 expansion makes tiny strings larger). Uncompressed
      // inline payloads stay as the raw string; compressed ones are base64'd and flagged via an
      // attribute.
      const inlineAttributes: Record<string, string> = {
        ...info.attributes,
        [INLINE_PAYLOAD_ATTRIBUTE]: text,
      };
      if (compress && isCompressionStreamSupported()) {
        const compressed = await deflateRawCompress(textInBytes);
        if (compressed.byteLength < textInBytes.byteLength) {
          inlineAttributes[INLINE_PAYLOAD_ATTRIBUTE] = encodeBase64(compressed);
          inlineAttributes[COMPRESSION_ATTRIBUTE] = COMPRESSION_DEFLATE_RAW;
        }
      }

      const header = buildTextStreamHeader({ ...info, attributes: inlineAttributes });
      const packet = createStreamHeaderPacket(header, options?.destinationIdentities);

      if (packet.toBinary().byteLength <= STREAM_CHUNK_SIZE_BYTES) {
        await this.engine.sendDataPacket(packet, DataChannelKind.RELIABLE);
        options?.onProgress?.(1);
        return info;
      }
    }

    const fileIds = options?.attachments?.map(() => crypto.randomUUID());

    const progresses = new Array<number>(fileIds ? fileIds.length + 1 : 1).fill(0);

    const handleProgress = (progress: number, idx: number) => {
      progresses[idx] = progress;
      const totalProgress = progresses.reduce((acc, val) => acc + val, 0);
      options?.onProgress?.(totalProgress);
    };

    // Phase 2: Try to send a multi packet data stream with compressed bytes
    if (
      compress &&
      isCompressionStreamSupported() &&
      this.allRecipientsSupportV2(options?.destinationIdentities)
    ) {
      info.attributes = { ...info.attributes, [COMPRESSION_ATTRIBUTE]: COMPRESSION_DEFLATE_RAW };
      info.attachedStreamIds = fileIds;

      const header = buildTextStreamHeader(info);
      const packet = createStreamHeaderPacket(header, options?.destinationIdentities);
      await this.sendChunkedByteStream(
        packet,
        streamId,
        options?.destinationIdentities,
        deflateRawCompressReadable(readableFromBytes(textEncoder.encode(text))),
      );

      // set text part of progress to 1
      handleProgress(1, 0);
    } else {
      // Phase 3 / fallback: header + plain uncompressed chunk packets + trailer.
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

  /**
   * Shared chunked-stream send for `sendText`/`sendFile`: sends the prebuilt header packet, then
   * forwards `source` (optionally deflate-raw compressed) as `streamChunk` packets re-chunked to
   * the MTU budget with contiguous indices, then sends the trailer. The source is consumed
   * incrementally, so a `file.stream()` is never buffered in full. The platform compressor can't
   * flush mid-stream, so compression is only used when the whole payload is available as a stream
   * up front (not for incremental writers like `streamText`/`streamBytes`).
   */
  private async sendChunkedByteStream(
    headerPacket: DataPacket,
    streamId: string,
    destinationIdentities: Array<string> | undefined,
    source: ReadableStream<Uint8Array>,
  ): Promise<void> {
    const engine = this.engine;
    await engine.sendDataPacket(headerPacket, DataChannelKind.RELIABLE);

    let chunkId = 0;
    for await (const chunk of readBytesInChunks(source, STREAM_CHUNK_SIZE_BYTES)) {
      const chunkPacket = new DataPacket({
        destinationIdentities,
        value: {
          case: 'streamChunk',
          value: new DataStream_Chunk({
            content: chunk,
            streamId,
            chunkIndex: numberToBigInt(chunkId),
          }),
        },
      });
      await engine.sendDataPacket(chunkPacket, DataChannelKind.RELIABLE);
      chunkId += 1;
    }

    await sendStreamTrailer(streamId, destinationIdentities, engine);
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

    // Incremental text streams are never compressed (CompressionStream does not support flushing
    // mid-stream); one-shot compression lives in sendText.
    //
    // Note that a future streamText could send a context-takeover style deflate-raw stream with
    // intermedia explicit `Z_SYNC_FLUSH`s - receivers already will handle this properly today.
    const writableStream = new WritableStream<string>({
      async write(text) {
        for (const textByteChunk of splitUtf8(text, STREAM_CHUNK_SIZE_BYTES)) {
          const chunk = new DataStream_Chunk({
            content: textByteChunk,
            streamId,
            chunkIndex: numberToBigInt(chunkId),
          });
          const chunkPacket = new DataPacket({
            destinationIdentities,
            value: {
              case: 'streamChunk',
              value: chunk,
            },
          });
          await engine.sendDataPacket(chunkPacket, DataChannelKind.RELIABLE);

          chunkId += 1;
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

  /**
   * Streams a file as a chunked byte stream, compressed (deflate-raw) when the runtime supports it
   * and every recipient is on data streams v2. The file is piped `file.stream()` →
   * (`CompressionStream`) → chunk packets, so it is never fully buffered in memory — unlike
   * `sendText`, there is no inline single-packet fast path for files.
   */
  private async _sendFile(
    streamId: string,
    file: File,
    options?: SendFileOptions,
  ): Promise<ByteStreamInfo> {
    const destinationIdentities = options?.destinationIdentities;
    const compress = options?.compress ?? true;

    // Phase 1: Try to send as a single packet data stream
    //
    // This is not being done explictly for files, because it's challenging to determine ahead of
    // time how well the file contents will compress (and whether the total output will be under the
    // MTU). Revisit this in the future though.

    // Phase 2: Try to send a multi packet data stream with compressed bytes
    if (compress && isCompressionStreamSupported() && this.allRecipientsSupportV2(destinationIdentities)) {
      const info: ByteStreamInfo = {
        id: streamId,
        name: file.name,
        mimeType: options?.mimeType ?? file.type,
        topic: options?.topic ?? '',
        timestamp: Date.now(),
        size: file.size,
        attributes: { [COMPRESSION_ATTRIBUTE]: COMPRESSION_DEFLATE_RAW },
        encryptionType: this.engine.e2eeManager?.isDataChannelEncryptionEnabled
          ? Encryption_Type.GCM
          : Encryption_Type.NONE,
      };

      const header = buildByteStreamHeader(info);
      const packet = createStreamHeaderPacket(header, destinationIdentities);
      await this.sendChunkedByteStream(
        packet,
        streamId,
        destinationIdentities,
        deflateRawCompressReadable(file.stream()),
      );

      return info;
    }

    // Phase 3 / fallback: header + plain uncompressed chunk packets + trailer.
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

    const info: ByteStreamInfo = {
      id: streamId,
      mimeType: options?.mimeType ?? 'application/octet-stream',
      topic: options?.topic ?? '',
      timestamp: Date.now(),
      attributes: options?.attributes,
      size: options?.totalSize,
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

    // Incremental byte streams are never compressed (CompressionStream does not support flushing
    // mid-stream); one-shot compression lives in sendFile.
    //
    // Note that a future streamBytes could send a context-takeover style deflate-raw stream with
    // intermedia explicit `Z_SYNC_FLUSH`s - receivers already will handle this properly today.
    const writableStream = new WritableStream<Uint8Array>({
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
