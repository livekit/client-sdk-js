import type RemoteParticipant from '../room/participant/RemoteParticipant';
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
  localEncryptionStatusChanged: (enabled: boolean) => void;
  remoteEncryptionStatusChanged: (enabled: boolean, participant?: RemoteParticipant) => void;
  error: (error: E2EEError) => void;
};

export type KeyInfo = {
  key: Uint8Array;
  participantId?: string;
  keyIndex?: number;
};

export type E2EEOptions = {
  keyProvider: BaseKeyProvider;
};
