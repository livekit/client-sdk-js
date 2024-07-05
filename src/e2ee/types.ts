import type { LogLevel } from '../logger';
import type { VideoCodec } from '../room/track/options';
import type { BaseKeyProvider } from './KeyProvider';

export interface BaseMessage {
  kind: string;
  data?: unknown;
}

export interface InitMessage extends BaseMessage {
  kind: 'init';
  data: {
    keyProviderOptions: KeyProviderOptions;
    loglevel: LogLevel;
  };
}

export interface SetKeyMessage extends BaseMessage {
  kind: 'setKey';
  data: {
    participantIdentity?: string;
    isPublisher: boolean;
    key: CryptoKey;
    keyIndex?: number;
  };
}

export interface RTPVideoMapMessage extends BaseMessage {
  kind: 'setRTPMap';
  data: {
    map: Map<number, VideoCodec>;
    participantIdentity: string;
  };
}

export interface SifTrailerMessage extends BaseMessage {
  kind: 'setSifTrailer';
  data: {
    trailer: Uint8Array;
  };
}

export interface EncodeMessage extends BaseMessage {
  kind: 'decode' | 'encode';
  data: {
    participantIdentity: string;
    readableStream: ReadableStream;
    writableStream: WritableStream;
    trackId: string;
    codec?: VideoCodec;
  };
}

export interface RemoveTransformMessage extends BaseMessage {
  kind: 'removeTransform';
  data: {
    participantIdentity: string;
    trackId: string;
  };
}

export interface UpdateCodecMessage extends BaseMessage {
  kind: 'updateCodec';
  data: {
    participantIdentity: string;
    trackId: string;
    codec: VideoCodec;
  };
}

export interface RatchetRequestMessage extends BaseMessage {
  kind: 'ratchetRequest';
  data: {
    participantIdentity?: string;
    keyIndex?: number;
  };
}

export interface RatchetMessage extends BaseMessage {
  kind: 'ratchetKey';
  data: {
    participantIdentity: string;
    keyIndex?: number;
    material: CryptoKey;
  };
}

export interface ErrorMessage extends BaseMessage {
  kind: 'error';
  data: {
    error: Error;
  };
}

export interface EnableMessage extends BaseMessage {
  kind: 'enable';
  data: {
    participantIdentity: string;
    enabled: boolean;
  };
}

export interface InitAck extends BaseMessage {
  kind: 'initAck';
  data: {
    enabled: boolean;
  };
}

export type E2EEWorkerMessage =
  | InitMessage
  | SetKeyMessage
  | EncodeMessage
  | ErrorMessage
  | EnableMessage
  | RemoveTransformMessage
  | RTPVideoMapMessage
  | UpdateCodecMessage
  | RatchetRequestMessage
  | RatchetMessage
  | SifTrailerMessage
  | InitAck;

export type KeySet = { material: CryptoKey; encryptionKey: CryptoKey };

export type KeyProviderOptions = {
  sharedKey: boolean;
  ratchetSalt: string;
  ratchetWindowSize: number;
  failureTolerance: number;
  keyringSize: number;
};

export type KeyInfo = {
  key: CryptoKey;
  participantIdentity?: string;
  keyIndex?: number;
};

export type E2EEOptions = {
  keyProvider: BaseKeyProvider;
  worker: Worker;
};

export type DecodeRatchetOptions = {
  /** attempts  */
  ratchetCount: number;
  /** ratcheted key to try */
  encryptionKey?: CryptoKey;
};
