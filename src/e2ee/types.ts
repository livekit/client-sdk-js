import type { BaseKeyProvider } from './keyProvider';

export interface BaseMessage {
  kind: string;
  payload: unknown;
}

export interface InitMessage extends BaseMessage {
  kind: 'init';
  payload: {
    sharedKey?: boolean;
  };
}

export interface SetKeyMessage extends BaseMessage {
  kind: 'setKey';
  payload: {
    participantId?: string;
    key: Uint8Array;
    keyIndex?: number;
  };
}

export interface EncodeMessage extends BaseMessage {
  kind: 'decode' | 'encode';
  payload: {
    participantId?: string;
    readableStream: ReadableStream;
    writableStream: WritableStream;
  };
}

export type E2EEWorkerMessage = InitMessage | SetKeyMessage | EncodeMessage;

export type KeySet = { material?: CryptoKey; encryptionKey: CryptoKey };

export type KeyProviderOptions = {
  sharedKey: boolean;
};

export type KeyProviderCallbacks = {
  setKey: (keyInfo: KeyInfo) => void;
};

export type KeyInfo = {
  key: Uint8Array;
  participantId?: string;
  keyIndex?: number;
};

export type E2EEOptions = {
  keyProvider: BaseKeyProvider;
};
