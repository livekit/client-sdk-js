import {
  ChatMessage as ChatMessageModel,
  type DataPacket,
  DataPacket_Kind,
  DataStream_Chunk,
  DataStream_Header,
  DataStream_Trailer,
  MetricsBatch,
  SipDTMF,
  Transcription as TranscriptionModel,
  UserPacket,
} from '@livekit/protocol';
import log, { /* LoggerNames, getLogger */ } from '../../logger';
import {
  type ByteStreamHandler,
  ByteStreamReader,
  type TextStreamHandler,
  TextStreamReader,
} from '../StreamReader';
import { ParticipantEvent, RoomEvent, TrackEvent } from '../events';
import Room from '../Room';
import type Participant from '../participant/Participant';
import RemoteParticipant from '../participant/RemoteParticipant';
import { MAX_PAYLOAD_BYTES, RpcError, type RpcInvocationData, byteLength } from '../rpc';
import {
  type ByteStreamInfo,
  type StreamController,
  type TextStreamInfo,
} from '../types';
import {
  bigIntToNumber,
  extractChatMessage,
  extractTranscriptionSegments,
} from '../utils';

export type RpcHandlersMap = Map<string, (data: RpcInvocationData) => Promise<string>>;

export default class IncomingDataStreamManager {
  private room: Room;
  private log = log;

  private byteStreamControllers = new Map<string, StreamController<DataStream_Chunk>>();
  private textStreamControllers = new Map<string, StreamController<DataStream_Chunk>>();

  private byteStreamHandlers = new Map<string, ByteStreamHandler>();
  private textStreamHandlers = new Map<string, TextStreamHandler>();

  private roomRpcHandlers: Map<string, (data: RpcInvocationData) => Promise<string>>;

  /**
   * map to store first point in time when a particular transcription segment was received
   */
  private transcriptionReceivedTimes: Map<string, number>;

  constructor(room: Room, roomRpcHandlers: Map<string, (data: RpcInvocationData) => Promise<string>>) {
    this.room = room;
    this.roomRpcHandlers = roomRpcHandlers;
    // FIXME: how should I create a logger properly here?
    // this.log = getLogger(this.options.loggerName ?? LoggerNames.Room);

    // FIXME: this class emitting on this.room?

    this.transcriptionReceivedTimes = new Map();
  }

  registerTextStreamHandler(topic: string, callback: TextStreamHandler) {
    if (this.textStreamHandlers.has(topic)) {
      throw new TypeError(`A text stream handler for topic "${topic}" has already been set.`);
    }
    this.textStreamHandlers.set(topic, callback);
  }

  unregisterTextStreamHandler(topic: string) {
    this.textStreamHandlers.delete(topic);
  }

  registerByteStreamHandler(topic: string, callback: ByteStreamHandler) {
    if (this.byteStreamHandlers.has(topic)) {
      throw new TypeError(`A byte stream handler for topic "${topic}" has already been set.`);
    }
    this.byteStreamHandlers.set(topic, callback);
  }

  unregisterByteStreamHandler(topic: string) {
    this.byteStreamHandlers.delete(topic);
  }

  handleDataPacket(packet: DataPacket) {
    // find the participant
    const participant = this.room.remoteParticipants.get(packet.participantIdentity);
    if (packet.value.case === 'user') {
      this.handleUserPacket(participant, packet.value.value, packet.kind);
    } else if (packet.value.case === 'transcription') {
      this.handleTranscription(participant, packet.value.value);
    } else if (packet.value.case === 'sipDtmf') {
      this.handleSipDtmf(participant, packet.value.value);
    } else if (packet.value.case === 'chatMessage') {
      this.handleChatMessage(participant, packet.value.value);
    } else if (packet.value.case === 'metrics') {
      this.handleMetrics(packet.value.value, participant);
    } else if (packet.value.case === 'streamHeader') {
      this.handleStreamHeader(packet.value.value, packet.participantIdentity);
    } else if (packet.value.case === 'streamChunk') {
      this.handleStreamChunk(packet.value.value);
    } else if (packet.value.case === 'streamTrailer') {
      this.handleStreamTrailer(packet.value.value);
    } else if (packet.value.case === 'rpcRequest') {
      const rpc = packet.value.value;
      this.handleIncomingRpcRequest(
        packet.participantIdentity,
        rpc.id,
        rpc.method,
        rpc.payload,
        rpc.responseTimeoutMs,
        rpc.version,
      );
    }
  }

  private async handleStreamHeader(streamHeader: DataStream_Header, participantIdentity: string) {
    if (streamHeader.contentHeader.case === 'byteHeader') {
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
      };
      const stream = new ReadableStream({
        start: (controller) => {
          streamController = controller;
          this.byteStreamControllers.set(streamHeader.streamId, {
            info,
            controller: streamController,
            startTime: Date.now(),
          });
        },
      });
      streamHandlerCallback(
        new ByteStreamReader(info, stream, bigIntToNumber(streamHeader.totalLength)),
        {
          identity: participantIdentity,
        },
      );
    } else if (streamHeader.contentHeader.case === 'textHeader') {
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
      };

      const stream = new ReadableStream<DataStream_Chunk>({
        start: (controller) => {
          streamController = controller;
          this.textStreamControllers.set(streamHeader.streamId, {
            info,
            controller: streamController,
            startTime: Date.now(),
          });
        },
      });
      streamHandlerCallback(
        new TextStreamReader(info, stream, bigIntToNumber(streamHeader.totalLength)),
        { identity: participantIdentity },
      );
    }
  }

  private handleStreamChunk(chunk: DataStream_Chunk) {
    const fileBuffer = this.byteStreamControllers.get(chunk.streamId);
    if (fileBuffer) {
      if (chunk.content.length > 0) {
        fileBuffer.controller.enqueue(chunk);
      }
    }
    const textBuffer = this.textStreamControllers.get(chunk.streamId);
    if (textBuffer) {
      if (chunk.content.length > 0) {
        textBuffer.controller.enqueue(chunk);
      }
    }
  }

  private handleStreamTrailer(trailer: DataStream_Trailer) {
    const textBuffer = this.textStreamControllers.get(trailer.streamId);
    if (textBuffer) {
      textBuffer.info.attributes = {
        ...textBuffer.info.attributes,
        ...trailer.attributes,
      };
      textBuffer.controller.close();
      this.textStreamControllers.delete(trailer.streamId);
    }

    const fileBuffer = this.byteStreamControllers.get(trailer.streamId);
    if (fileBuffer) {
      {
        fileBuffer.info.attributes = { ...fileBuffer.info.attributes, ...trailer.attributes };
        fileBuffer.controller.close();
        this.byteStreamControllers.delete(trailer.streamId);
      }
    }
  }

  private handleUserPacket = (
    participant: RemoteParticipant | undefined,
    userPacket: UserPacket,
    kind: DataPacket_Kind,
  ) => {
    this.room.emit(RoomEvent.DataReceived, userPacket.payload, participant, kind, userPacket.topic);

    // also emit on the participant
    participant?.emit(ParticipantEvent.DataReceived, userPacket.payload, kind);
  };

  private handleSipDtmf = (participant: RemoteParticipant | undefined, dtmf: SipDTMF) => {
    this.room.emit(RoomEvent.SipDTMFReceived, dtmf, participant);

    // also emit on the participant
    participant?.emit(ParticipantEvent.SipDTMFReceived, dtmf);
  };

  private handleTranscription = (
    _remoteParticipant: RemoteParticipant | undefined,
    transcription: TranscriptionModel,
  ) => {
    // find the participant
    const participant =
      transcription.transcribedParticipantIdentity === this.room.localParticipant.identity
        ? this.room.localParticipant
        : this.room.getParticipantByIdentity(transcription.transcribedParticipantIdentity);
    const publication = participant?.trackPublications.get(transcription.trackId);

    const segments = extractTranscriptionSegments(transcription, this.transcriptionReceivedTimes);

    publication?.emit(TrackEvent.TranscriptionReceived, segments);
    participant?.emit(ParticipantEvent.TranscriptionReceived, segments, publication);
    this.room.emit(RoomEvent.TranscriptionReceived, segments, participant, publication);
  };

  private handleChatMessage = (
    participant: RemoteParticipant | undefined,
    chatMessage: ChatMessageModel,
  ) => {
    const msg = extractChatMessage(chatMessage);
    this.room.emit(RoomEvent.ChatMessage, msg, participant);
  };

  private handleMetrics = (metrics: MetricsBatch, participant?: Participant) => {
    this.room.emit(RoomEvent.MetricsReceived, metrics, participant);
  };

  private async handleIncomingRpcRequest(
    callerIdentity: string,
    requestId: string,
    method: string,
    payload: string,
    responseTimeout: number,
    version: number,
  ) {
    await this.room.engine.publishRpcAck(callerIdentity, requestId);

    if (version !== 1) {
      await this.room.engine.publishRpcResponse(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('UNSUPPORTED_VERSION'),
      );
      return;
    }

    const handler = this.roomRpcHandlers.get(method);

    if (!handler) {
      await this.room.engine.publishRpcResponse(
        callerIdentity,
        requestId,
        null,
        RpcError.builtIn('UNSUPPORTED_METHOD'),
      );
      return;
    }

    let responseError: RpcError | null = null;
    let responsePayload: string | null = null;

    try {
      const response = await handler({
        requestId,
        callerIdentity,
        payload,
        responseTimeout,
      });
      if (byteLength(response) > MAX_PAYLOAD_BYTES) {
        responseError = RpcError.builtIn('RESPONSE_PAYLOAD_TOO_LARGE');
        console.warn(`RPC Response payload too large for ${method}`);
      } else {
        responsePayload = response;
      }
    } catch (error) {
      if (error instanceof RpcError) {
        responseError = error;
      } else {
        console.warn(
          `Uncaught error returned by RPC handler for ${method}. Returning APPLICATION_ERROR instead.`,
          error,
        );
        responseError = RpcError.builtIn('APPLICATION_ERROR');
      }
    }
    await this.room.engine.publishRpcResponse(callerIdentity, requestId, responsePayload, responseError);
  }
}
