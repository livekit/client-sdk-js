import type Participant from '../room/participant/Participant';
import type { VideoCodec } from '../room/track/options';
import type { E2EEError, E2EEErrorReason } from './errors';
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
    codec?: VideoCodec;
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
  | EnableMessage;

export type KeySet = { material?: CryptoKey; encryptionKey: CryptoKey };

export type KeyProviderOptions = {
  sharedKey: boolean;
};

export type KeyProviderCallbacks = {
  setKey: (keyInfo: KeyInfo) => void;
};

export type E2EEManagerCallbacks = {
  participantEncryptionStatusChanged: (enabled: boolean, participant?: Participant) => void;
  e2eeError: (error: E2EEErrorReason) => void;
};

export const EncryptionEvent = {
  ParticipantEncryptionStatusChanged: 'participantEncryptionStatusChanged',
  Error: 'e2eeError',
} as const;

export type CryptorCallbacks = {
  cryptorError: (error: E2EEErrorReason) => void;
};

export type KeyInfo = {
  key: Uint8Array;
  participantId?: string;
  keyIndex?: number;
};

export type E2EEOptions = {
  keyProvider: BaseKeyProvider;
};
