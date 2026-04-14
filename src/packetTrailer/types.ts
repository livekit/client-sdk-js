import type { PacketTrailerMetadata } from '../e2ee/packetTrailer';

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
  };
}

export interface PTRemoveTransformMessage extends PTBaseMessage {
  kind: 'removeTransform';
  data: {
    trackId: string;
  };
}

export interface PTMetadataMessage extends PTBaseMessage {
  kind: 'metadata';
  data: {
    trackId: string;
    rtpTimestamp: number;
    ssrc: number;
    metadata: PacketTrailerMetadata;
  };
}

export type PTWorkerMessage =
  | PTInitMessage
  | PTInitAck
  | PTDecodeMessage
  | PTRemoveTransformMessage
  | PTMetadataMessage;
