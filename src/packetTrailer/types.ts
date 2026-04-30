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
  };
}

export interface PTEncodeMessage extends PTBaseMessage {
  kind: 'encode';
  data: {
    readableStream: ReadableStream;
    writableStream: WritableStream;
    packetTrailer?: PacketTrailerPublishOptions;
  };
}

export type PTScriptTransformOptions =
  | {
      kind: 'decode';
      trackId: string;
    }
  | {
      kind: 'encode';
      packetTrailer?: PacketTrailerPublishOptions;
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
  };
}

export type PTWorkerMessage =
  | PTInitMessage
  | PTInitAck
  | PTDecodeMessage
  | PTEncodeMessage
  | PTUpdateTrackIdMessage
  | PTMetadataMessage;
