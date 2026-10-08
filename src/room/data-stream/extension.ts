import type { DataPacket, Encryption_Type } from '@livekit/protocol';
import type { RoomDataStreamOptions } from '../../options';
import { CLIENT_PROTOCOL_DEFAULT } from '../../version';
import { ConnectionState } from '../CoreRoom';
import type { CoreRoom } from '../CoreRoom';
import { RoomEvent } from '../events';
import {
  type ConfigurableExtension,
  type ExtensionContext,
  type ExtensionResult,
  defineExtension,
} from '../extensions';
import type {
  ByteStreamInfo,
  SendBytesOptions,
  SendFileOptions,
  SendTextOptions,
  StreamBytesOptions,
  StreamTextOptions,
  TextStreamInfo,
} from '../types';
import IncomingDataStreamManager from './incoming/IncomingDataStreamManager';
import type { ByteStreamHandler, TextStreamHandler } from './incoming/StreamReader';
import OutgoingDataStreamManager from './outgoing/OutgoingDataStreamManager';
import type { ByteStreamWriter, TextStreamWriter } from './outgoing/StreamWriter';

/** Methods the `dataStreams` extension adds to the room. */
export interface DataStreamRoomApi {
  registerTextStreamHandler(topic: string, callback: TextStreamHandler): void;
  unregisterTextStreamHandler(topic: string): void;
  registerByteStreamHandler(topic: string, callback: ByteStreamHandler): void;
  unregisterByteStreamHandler(topic: string): void;
}

/** Methods the `dataStreams` extension adds to the local participant. */
export interface DataStreamLocalApi {
  /**
   * Sends the given string to participants in the room via the data channel.
   * For longer messages, consider using {@link streamText} instead.
   *
   * @param text The text payload
   * @param options.topic Topic identifier used to route the stream to appropriate handlers.
   */
  sendText(text: string, options?: SendTextOptions): Promise<TextStreamInfo>;

  /**
   * Creates a new TextStreamWriter which can be used to stream text incrementally
   * to participants in the room via the data channel.
   *
   * @param options.topic Topic identifier used to route the stream to appropriate handlers.
   *
   * @internal
   * @experimental CAUTION, might get removed in a minor release
   */
  streamText(options?: StreamTextOptions): Promise<TextStreamWriter>;

  /** Send a File to all participants in the room via the data channel.
   * @param file The File object payload
   * @param options.topic Topic identifier used to route the stream to appropriate handlers.
   * @param options.onProgress A callback function used to monitor the upload progress percentage.
   */
  sendFile(file: File, options?: SendFileOptions): Promise<{ id: string }>;

  /**
   * Sends the given bytes to participants in the room via the data channel.
   * For files, consider using {@link sendFile}; for longer/incremental payloads, {@link streamBytes}.
   *
   * @param bytes The byte payload
   * @param options.topic Topic identifier used to route the stream to appropriate handlers.
   */
  sendBytes(bytes: Uint8Array, options?: SendBytesOptions): Promise<ByteStreamInfo>;

  /**
   * Stream bytes incrementally to participants in the room via the data channel.
   * For sending files, consider using {@link sendFile} instead.
   *
   * @param options.topic Topic identifier used to route the stream to appropriate handlers.
   */
  streamBytes(options?: StreamBytesOptions): Promise<ByteStreamWriter>;
}

/**
 * Text and byte streams (`sendText`, `sendFile`, `registerTextStreamHandler`, ...).
 */
export type DataStreamsExtension = ConfigurableExtension<
  ExtensionResult<DataStreamRoomApi, DataStreamLocalApi> & {
    incoming: IncomingDataStreamManager;
    outgoing: OutgoingDataStreamManager;
  },
  RoomDataStreamOptions,
  readonly []
>;

export const dataStreams: DataStreamsExtension = /* @__PURE__ */ defineExtension(
  'dataStreams',
  [],
  (
    room: CoreRoom,
    ctx: ExtensionContext,
    streamOptions: RoomDataStreamOptions | undefined,
  ): ExtensionResult<DataStreamRoomApi, DataStreamLocalApi> & {
    incoming: IncomingDataStreamManager;
    outgoing: OutgoingDataStreamManager;
  } => {
    const incoming = new IncomingDataStreamManager(
      (streamOptions ?? room.options.dataStream)?.maxPayloadByteLength,
    );
    const outgoing = new OutgoingDataStreamManager(
      room.engine,
      ctx.log,
      (identity) =>
        room.remoteParticipants.get(identity)?.clientProtocol ?? CLIENT_PROTOCOL_DEFAULT,
      (identity) => room.remoteParticipants.get(identity)?.capabilities ?? [],
      () => Array.from(room.remoteParticipants.keys()),
    );
    ctx.onEngineCreated((engine) => outgoing.setupEngine(engine));

    const onStreamPacket = (_value: unknown, packet: DataPacket, encryptionType: Encryption_Type) =>
      incoming.handleDataStreamPacket(packet, encryptionType);
    ctx.onDataPacket('streamHeader', onStreamPacket);
    ctx.onDataPacket('streamChunk', onStreamPacket);
    ctx.onDataPacket('streamTrailer', onStreamPacket);
    ctx.onDisconnect(() => incoming.clearControllers());

    room
      .on(RoomEvent.ConnectionStateChanged, (state) =>
        incoming.setConnected(state === ConnectionState.Connected),
      )
      .on(RoomEvent.ParticipantDisconnected, (participant) =>
        incoming.validateParticipantHasNoActiveDataStreams(participant.identity),
      );

    // The preconnect audio buffer is sent as a byte stream from inside the core publish path.
    ctx.setLocalParticipantSlot('openByteStream', (options) => outgoing.streamBytes(options));

    return {
      incoming,
      outgoing,
      room: {
        registerTextStreamHandler: (topic, callback) =>
          incoming.registerTextStreamHandler(topic, callback),
        unregisterTextStreamHandler: (topic) => incoming.unregisterTextStreamHandler(topic),
        registerByteStreamHandler: (topic, callback) =>
          incoming.registerByteStreamHandler(topic, callback),
        unregisterByteStreamHandler: (topic) => incoming.unregisterByteStreamHandler(topic),
      },
      local: {
        sendText: (text, options) => outgoing.sendText(text, options),
        streamText: (options) => outgoing.streamText(options),
        sendFile: (file, options) => outgoing.sendFile(file, options),
        sendBytes: (bytes, options) => outgoing.sendBytes(bytes, options),
        streamBytes: (options) => outgoing.streamBytes(options),
      },
    };
  },
);
