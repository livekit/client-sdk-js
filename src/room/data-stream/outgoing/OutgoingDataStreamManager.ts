import { Mutex } from '@livekit/mutex';
import {
  DataPacket,
  DataStream_Chunk,
  DataStream_Trailer,
  Encryption_Type,
} from '@livekit/protocol';
import { type StructuredLogger } from '../../../logger';
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
import { numberToBigInt, splitUtf8 } from '../../utils';
import { INLINE_PAYLOAD_ATTRIBUTE, STREAM_CHUNK_SIZE_BYTES } from '../constants';
import { ByteStreamWriter, TextStreamWriter } from './StreamWriter';
import {
  buildByteStreamHeader,
  buildTextStreamHeader,
  createStreamHeaderPacket,
} from './header-utils';

/**
 * Manages sending custom user data via data channels.
 * @internal
 */
export default class OutgoingDataStreamManager {
  protected engine: RTCEngine;

  protected log: StructuredLogger;

  constructor(engine: RTCEngine, log: StructuredLogger) {
    this.engine = engine;
    this.log = log;
  }

  setupEngine(engine: RTCEngine) {
    this.engine = engine;
  }

  /** {@inheritDoc LocalParticipant.sendText} */
  async sendText(text: string, options?: SendTextOptions): Promise<TextStreamInfo> {
    const streamId = crypto.randomUUID();
    const textInBytes = new TextEncoder().encode(text);
    const totalTextLength = textInBytes.byteLength;

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
    return writer.info;
  }

  /**
   * Attempts to send `text` as a single header packet with the payload smuggled into a reserved
   * attribute. Returns the resulting {@link TextStreamInfo} if it fit under the MTU, or `undefined`
   * if the caller should fall back to the regular chunked stream.
   */
  private async trySendInlineText(
    streamId: string,
    text: string,
    totalTextLength: number,
    options?: SendTextOptions,
  ): Promise<TextStreamInfo | null> {
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

    const header = buildTextStreamHeader({
      ...info,
      attributes: { ...info.attributes, [INLINE_PAYLOAD_ATTRIBUTE]: text },
    });
    const packet = createStreamHeaderPacket(header, options?.destinationIdentities);

    if (packet.toBinary().byteLength > STREAM_CHUNK_SIZE_BYTES) {
      return null;
    }

    await this.engine.sendDataPacket(packet, DataChannelKind.RELIABLE);
    options?.onProgress?.(1);
    return info;
  }

  /**
   * @internal
   */
  async streamText(options?: StreamTextOptions): Promise<TextStreamWriter> {
    const streamId = options?.streamId ?? crypto.randomUUID();

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
    const destinationIdentities = options?.destinationIdentities;
    const packet = createStreamHeaderPacket(header, destinationIdentities);
    await this.engine.sendDataPacket(packet, DataChannelKind.RELIABLE);

    let chunkId = 0;
    const engine = this.engine;

    const writableStream = new WritableStream<string>({
      // Implement the sink
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
        const trailer = new DataStream_Trailer({
          streamId,
        });
        const trailerPacket = new DataPacket({
          destinationIdentities,
          value: {
            case: 'streamTrailer',
            value: trailer,
          },
        });
        await engine.sendDataPacket(trailerPacket, DataChannelKind.RELIABLE);
      },
      abort(err) {
        console.log('Sink error:', err);
        // TODO handle aborts to signal something to receiver side
      },
    });

    let onEngineClose = async () => {
      await writer.close();
    };

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
        const trailer = new DataStream_Trailer({
          streamId,
        });
        const trailerPacket = new DataPacket({
          destinationIdentities,
          value: {
            case: 'streamTrailer',
            value: trailer,
          },
        });
        await engine.sendDataPacket(trailerPacket, DataChannelKind.RELIABLE);
      },
      abort(err) {
        logLocal.error('Sink error:', err);
      },
    });

    const byteWriter = new ByteStreamWriter(writableStream, info);

    return byteWriter;
  }
}
