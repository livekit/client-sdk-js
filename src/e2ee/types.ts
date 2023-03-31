import type Participant from '../room/participant/Participant';
import type { VideoCodec } from '../room/track/options';
import type { E2EEError } from './errors';
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
    key: CryptoKey;
    keyIndex?: number;
  };
}

export interface RTPVideoMapMessage extends BaseMessage {
  kind: 'setRTPMap';
  data: {
    map: Map<number, VideoCodec>;
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
    participantId: string | undefined;
    keyIndex?: number;
  };
}

export interface RatchetMessage extends BaseMessage {
  kind: 'ratchetKey';
  data: {
    // participantId: string | undefined;
    keyIndex?: number;
    material: CryptoKey;
  };
}

export interface ErrorMessage extends BaseMessage {
  kind: 'error';
  data: {
    error: E2EEError;
  };
}

export interface EnableMessage extends BaseMessage {
  kind: 'enable';
  data: {
    // if no participant id is set it indicates publisher encryption enable/disable
    participantId?: string;
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
  | RatchetMessage;

export type KeySet = { material: CryptoKey; encryptionKey: CryptoKey };

export type KeyProviderOptions = {
  sharedKey: boolean;
  ratchetSalt: string;
  ratchetWindowSize: number;
};

export type KeyProviderCallbacks = {
  setKey: (keyInfo: KeyInfo) => void;
  ratchetRequest: (participantId?: string, keyIndex?: number) => void;
  /** currently only emitted for local participant */
  keyRatcheted: (material: CryptoKey, keyIndex?: number) => void;
};

export type ParticipantKeyHandlerCallbacks = {
  /** currently only emitted for local participant */
  keyRatcheted: (material: CryptoKey, keyIndex?: number) => void;
};

export type E2EEManagerCallbacks = {
  participantEncryptionStatusChanged: (enabled: boolean, participant?: Participant) => void;
  encryptionError: (error: E2EEError) => void;
};

export const EncryptionEvent = {
  ParticipantEncryptionStatusChanged: 'participantEncryptionStatusChanged',
  Error: 'encryptionError',
} as const;

export type CryptorCallbacks = {
  cryptorError: (error: E2EEError) => void;
};

export const CryptorEvent = {
  Error: 'cryptorError',
} as const;

export type KeyInfo = {
  key: CryptoKey;
  participantId?: string;
  keyIndex?: number;
};

export type E2EEOptions = {
  keyProvider: BaseKeyProvider;
  worker: Worker;
};
