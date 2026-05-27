import type { VideoCodec } from '../room/track/options';
import type { PacketTrailerFramePayload } from './packetTrailer';

export interface PacketTrailerMetadata {
  userTimestamp: bigint;
  frameId: number;
}

export interface PacketTrailerPublishOptions {
  timestamp?: boolean;
  frameId?: boolean;
}

export interface PTBaseMessage {
  kind: string;
  data?: unknown;
}

export interface PTInitMessage extends PTBaseMessage {
  kind: 'init';
}

export interface PTInitAck extends PTBaseMessage {
  kind: 'initAck';
}

export interface PTDecodeMessage extends PTBaseMessage {
  kind: 'decode';
  data: {
    readableStream: ReadableStream;
    writableStream: WritableStream;
    trackId: string;
    hasPacketTrailer: boolean;
    codec?: VideoCodec;
  };
}

export interface PTEncodeMessage extends PTBaseMessage {
  kind: 'encode';
  data: {
    readableStream: ReadableStream;
    writableStream: WritableStream;
    packetTrailer?: PacketTrailerPublishOptions;
    codec?: VideoCodec;
  };
}

export type PTScriptTransformOptions =
  | {
      kind: 'decode';
      trackId: string;
      codec?: VideoCodec;
    }
  | {
      kind: 'encode';
      packetTrailer?: PacketTrailerPublishOptions;
      codec?: VideoCodec;
    };

export interface PTMetadataMessage extends PTBaseMessage {
  kind: 'metadata';
  data: PacketTrailerFramePayload;
}

export interface PTUpdateTrackIdMessage extends PTBaseMessage {
  kind: 'updateTrackId';
  data: {
    oldTrackId: string;
    newTrackId: string;
    hasPacketTrailer: boolean;
    codec?: VideoCodec;
  };
}

export type PTWorkerMessage =
  | PTInitMessage
  | PTInitAck
  | PTDecodeMessage
  | PTEncodeMessage
  | PTUpdateTrackIdMessage
  | PTMetadataMessage;
