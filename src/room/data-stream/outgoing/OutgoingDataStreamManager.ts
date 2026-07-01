import { Mutex } from '@livekit/mutex';
import {
  ClientInfo_Capability,
  DataPacket,
  DataStream_Chunk,
  DataStream_CompressionType,
  DataStream_Trailer,
  Encryption_Type,
} from '@livekit/protocol';
import { type StructuredLogger } from '../../../logger';
import { CLIENT_PROTOCOL_DATA_STREAM_V2 } from '../../../version';
import type RTCEngine from '../../RTCEngine';
import { DataChannelKind } from '../../RTCEngine';
import { DataStreamError, DataStreamErrorReason } from '../../errors';
import { EngineEvent } from '../../events';
import type {
  ByteStreamInfo,
  SendBytesOptions,
  SendFileOptions,
  SendTextOptions,
  StreamBytesOptions,
  StreamTextOptions,
  TextStreamInfo,
} from '../../types';
import {
  isCompressionStreamSupported,
  numberToBigInt,
  readBytesInChunks,
  readableFromBytes,
  splitUtf8,
} from '../../utils';
import { collect, deflateRawTransform } from '../compression';
import { STREAM_CHUNK_SIZE_BYTES } from '../constants';
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

  /** Returns the client capabilities a remote participant advertises, used to decide whether a
   * recipient can decompress a deflate-raw compressed stream. */
  protected getRemoteParticipantCapabilities: (identity: string) => Array<ClientInfo_Capability>;

  /** Returns the identities of every remote participant currently in the room, used to decide
   * whether a broadcast (no explicit destinations) can be sent inline. */
  protected getAllRemoteParticipantIdentities: () => Array<string>;

  constructor(
    engine: RTCEngine,
    log: StructuredLogger,
    getRemoteParticipantClientProtocol: (identity: string) => number,
    getRemoteParticipantCapabilities: (identity: string) => Array<ClientInfo_Capability>,
    getAllRemoteParticipantIdentities: () => Array<string>,
  ) {
    this.engine = engine;
    this.log = log;
    this.getRemoteParticipantClientProtocol = getRemoteParticipantClientProtocol;
    this.getRemoteParticipantCapabilities = getRemoteParticipantCapabilities;
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

    const compressEligible =
      compress &&
      isCompressionStreamSupported() &&
      this.allRecipientsSupportV2(options?.destinationIdentities) &&
      this.allRecipientsSupportCompression(options?.destinationIdentities);
    let compressedStream = compressEligible
      ? CompressedStreamState.fromStream(
          readableFromBytes(textInBytes).pipeThrough(deflateRawTransform()),
        )
      : null;

    // Phase 1: Try to send as a single packet data stream
    const noAttachments = !options?.attachments || options.attachments.length === 0;
    if (noAttachments && this.allRecipientsSupportV2(options?.destinationIdentities)) {
      // The payload rides in the header's `inlineContent` (raw bytes). Keep the compressed form only
      // if it actually shrinks the payload (deflate framing makes tiny strings larger). The
      // compression flag is carried in the header's `compression` field; user attributes are left
      // untouched.
      let inlineContent: Uint8Array = textInBytes;
      let compression = DataStream_CompressionType.NONE;
      if (compressedStream) {
        const collectedBytes = await compressedStream.collect();
        if (collectedBytes.byteLength < textInBytes.byteLength) {
          inlineContent = collectedBytes;
          compression = DataStream_CompressionType.DEFLATE_RAW;
        }
      }

      const header = buildTextStreamHeader(info, undefined, { compression, inlineContent });
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
    if (compressedStream) {
      info.attachedStreamIds = fileIds;

      const header = buildTextStreamHeader(info, undefined, {
        compression: DataStream_CompressionType.DEFLATE_RAW,
      });
      const packet = createStreamHeaderPacket(header, options?.destinationIdentities);
      await this.sendChunkedByteStream(
        packet,
        streamId,
        options?.destinationIdentities,
        compressedStream.stream(),
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
   * Sends a complete in-memory byte payload. Mirrors {@link sendText}'s semantics: when every
   * recipient supports data streams v2 the payload rides inline in a single header packet
   * (optionally deflate-raw compressed), otherwise it is sent as a (optionally compressed)
   * chunked byte stream. Unlike {@link sendFile}, the whole payload is already in memory, so the
   * inline single-packet fast path applies.
   */
  async sendBytes(bytes: Uint8Array, options?: SendBytesOptions): Promise<ByteStreamInfo> {
    const streamId = crypto.randomUUID();
    const destinationIdentities = options?.destinationIdentities;
    const compress = options?.compress ?? true;

    const info: ByteStreamInfo = {
      id: streamId,
      name: 'unknown',
      mimeType: 'application/octet-stream',
      timestamp: Date.now(),
      topic: options?.topic ?? '',
      size: bytes.byteLength, // NOTE: size is always the pre-compression byte length
      attributes: options?.attributes,
      encryptionType: this.engine.e2eeManager?.isDataChannelEncryptionEnabled
        ? Encryption_Type.GCM
        : Encryption_Type.NONE,
    };

    const compressEligible =
      compress &&
      isCompressionStreamSupported() &&
      this.allRecipientsSupportV2(destinationIdentities) &&
      this.allRecipientsSupportCompression(destinationIdentities);
    let compressedStream = compressEligible
      ? CompressedStreamState.fromStream(
          readableFromBytes(bytes).pipeThrough(deflateRawTransform()),
        )
      : null;

    // Phase 1: Try to send as a single packet data stream
    if (this.allRecipientsSupportV2(destinationIdentities)) {
      // The payload rides in the header's `inlineContent` (raw bytes). Keep the compressed form only
      // if it actually shrinks the payload (deflate framing makes tiny payloads larger). The
      // compression flag is carried in the header's `compression` field; user attributes are left
      // untouched.
      let inlineContent: Uint8Array = bytes;
      let compression = DataStream_CompressionType.NONE;
      if (compressedStream) {
        const collectedBytes = await compressedStream.collect();
        if (collectedBytes.byteLength < bytes.byteLength) {
          inlineContent = collectedBytes;
          compression = DataStream_CompressionType.DEFLATE_RAW;
        }
      }

      const header = buildByteStreamHeader(info, { compression, inlineContent });
      const packet = createStreamHeaderPacket(header, destinationIdentities);

      if (packet.toBinary().byteLength <= STREAM_CHUNK_SIZE_BYTES) {
        await this.engine.sendDataPacket(packet, DataChannelKind.RELIABLE);
        options?.onProgress?.(1);
        return info;
      }
    }

    // Phase 2/3: header + (optionally compressed) chunk packets + trailer.
    const header = buildByteStreamHeader(info, {
      compression: compressedStream
        ? DataStream_CompressionType.DEFLATE_RAW
        : DataStream_CompressionType.NONE,
    });
    const packet = createStreamHeaderPacket(header, destinationIdentities);
    const source = compressedStream ? compressedStream.stream() : readableFromBytes(bytes);
    await this.sendChunkedByteStream(packet, streamId, destinationIdentities, source);
    options?.onProgress?.(1);

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
   * Returns true only if every recipient advertises the deflate-raw compression capability (so it
   * can decompress a compressed stream). Resolved the same way as {@link allRecipientsSupportV2}:
   * named destinations, or every remote participant for a broadcast; an empty room is eligible.
   */
  private allRecipientsSupportCompression(destinationIdentities?: Array<string>): boolean {
    const identities =
      destinationIdentities && destinationIdentities.length > 0
        ? destinationIdentities
        : this.getAllRemoteParticipantIdentities();
    return identities.every((identity) =>
      this.getRemoteParticipantCapabilities(identity).includes(
        ClientInfo_Capability.CAP_COMPRESSION_DEFLATE_RAW,
      ),
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
    await sendHeaderPacket(engine, headerPacket);

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
    await sendHeaderPacket(this.engine, packet);

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
   * (`CompressionStream`) → chunk packets via {@link sendChunkedByteStream}, so it is never fully
   * buffered in memory — unlike {@link sendBytes}, there is no inline single-packet fast path for
   * files (the compressed size can't be known up front without buffering the whole file).
   */
  private async _sendFile(
    streamId: string,
    file: File,
    options?: SendFileOptions,
  ): Promise<ByteStreamInfo> {
    const destinationIdentities = options?.destinationIdentities;
    const compress =
      (options?.compress ?? true) &&
      isCompressionStreamSupported() &&
      this.allRecipientsSupportV2(destinationIdentities) &&
      this.allRecipientsSupportCompression(destinationIdentities);

    const info: ByteStreamInfo = {
      id: streamId,
      name: file.name,
      mimeType: options?.mimeType ?? file.type,
      topic: options?.topic ?? '',
      timestamp: Date.now(),
      size: file.size,
      encryptionType: this.engine.e2eeManager?.isDataChannelEncryptionEnabled
        ? Encryption_Type.GCM
        : Encryption_Type.NONE,
    };

    // Phase 1: Try to send as a single packet data stream
    //
    // This is not being done explictly for files, because it's challenging to determine ahead of
    // time how well the file contents will compress (and whether the total output will be under the
    // MTU). Revisit this in the future though.

    // Phase 2 (compressed) / Phase 3 (uncompressed fallback): header + chunk packets + trailer. Both
    // funnel through the shared sendChunkedByteStream primitive, differing only by whether the file
    // stream is wrapped in the deflate-raw compressor; the file is never fully buffered in memory.
    const header = buildByteStreamHeader(info, {
      compression: compress
        ? DataStream_CompressionType.DEFLATE_RAW
        : DataStream_CompressionType.NONE,
    });
    const packet = createStreamHeaderPacket(header, destinationIdentities);
    const source = compress ? file.stream().pipeThrough(deflateRawTransform()) : file.stream();
    await this.sendChunkedByteStream(packet, streamId, destinationIdentities, source);

    return info;
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

    await sendHeaderPacket(this.engine, packet);

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

/** A utility to handle lazily calling {@link collect} on a stream of compressed bytes only when
 * requested, to avoid buffering lots of data into memory until the program needs it.
 */
class CompressedStreamState {
  private state:
    | { type: 'stream'; stream: ReadableStream<Uint8Array> }
    | { type: 'collected'; bytes: Uint8Array<ArrayBufferLike> };

  private constructor(state: typeof this.state) {
    this.state = state;
  }

  static fromStream(stream: ReadableStream<Uint8Array>) {
    return new CompressedStreamState({ type: 'stream', stream });
  }

  /** Collect data from the stream into memory and return as a Uint8Array. */
  async collect() {
    switch (this.state.type) {
      case 'stream':
        const bytes = await collect(this.state.stream);
        this.state = { type: 'collected', bytes };
        return bytes;
      case 'collected':
        return this.state.bytes;
    }
  }

  /** Pass wrapped stream through to downstream consumer. */
  stream() {
    switch (this.state.type) {
      case 'stream':
        return this.state.stream;
      case 'collected':
        return readableFromBytes(this.state.bytes);
    }
  }
}

/**
 * Sends a stream `streamHeader` packet, enforcing that it fits the MTU budget. The header carries
 * the user attributes (plus topic/framing), and a single `DataPacket` larger than the MTU can't be
 * reliably sent — so an oversized header (almost always due to large attributes) is a hard error
 * rather than a malformed packet on the wire. The inline fast path does its own size check and
 * falls back to the chunked path instead of calling this.
 */
async function sendHeaderPacket(engine: RTCEngine, packet: DataPacket): Promise<void> {
  if (packet.toBinary().byteLength > STREAM_CHUNK_SIZE_BYTES) {
    throw new DataStreamError(
      `data stream header exceeds the ${STREAM_CHUNK_SIZE_BYTES}-byte limit; reduce attribute size`,
      DataStreamErrorReason.HeaderTooLarge,
    );
  }
  await engine.sendDataPacket(packet, DataChannelKind.RELIABLE);
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
