import type Participant from '../room/participant/Participant';
import type { E2EEError } from './errors';
import type { BaseKeyProvider } from './keyProvider';

export interface BaseMessage {
  kind: string;
  data: unknown;
}

export interface InitMessage extends BaseMessage {
  kind: 'init';
  data: {
    sharedKey?: boolean;
  };
}

export interface SetKeyMessage extends BaseMessage {
  kind: 'setKey';
  data: {
    participantId?: string;
    key: Uint8Array;
    keyIndex?: number;
  };
}

export interface EncodeMessage extends BaseMessage {
  kind: 'decode' | 'encode';
  data: {
    participantId: string;
    readableStream: ReadableStream;
    writableStream: WritableStream;
    trackId: string;
    codec?: string;
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
    codec: string;
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
  | UpdateCodecMessage;

export type KeySet = { material?: CryptoKey; encryptionKey: CryptoKey };

export type KeyProviderOptions = {
  sharedKey: boolean;
};

export type KeyProviderCallbacks = {
  setKey: (keyInfo: KeyInfo) => void;
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
  key: Uint8Array;
  participantId?: string;
  keyIndex?: number;
};

export type E2EEOptions = {
  keyProvider: BaseKeyProvider;
};
