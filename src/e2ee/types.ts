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
  };
}

export interface SetKeyMessage extends BaseMessage {
  kind: 'setKey';
  data: {
    participantId?: string;
    isPublisher: boolean;
    key: CryptoKey;
    keyIndex?: number;
  };
}

export interface RTPVideoMapMessage extends BaseMessage {
  kind: 'setRTPMap';
  data: {
    map: Map<number, VideoCodec>;
    participantId: string;
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
    participantId: string;
    readableStream: ReadableStream;
    writableStream: WritableStream;
    trackId: string;
    codec?: VideoCodec;
  };
}

export interface RemoveTransformMessage extends BaseMessage {
  kind: 'removeTransform';
  data: {
    participantId: string;
    trackId: string;
  };
}

export interface UpdateCodecMessage extends BaseMessage {
  kind: 'updateCodec';
  data: {
    participantId: string;
    trackId: string;
    codec: VideoCodec;
  };
}

export interface RatchetRequestMessage extends BaseMessage {
  kind: 'ratchetRequest';
  data: {
    participantId?: string;
    keyIndex?: number;
  };
}

export interface RatchetMessage extends BaseMessage {
  kind: 'ratchetKey';
  data: {
    participantId: string;
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
    participantId: string;
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
};

export type KeyInfo = {
  key: CryptoKey;
  participantId?: string;
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
