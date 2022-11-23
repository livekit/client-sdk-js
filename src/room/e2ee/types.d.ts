export interface BaseMessage {
  kind: string;
  payload: unknown;
}

export interface InitMessage extends BaseMessage {
  kind: 'init';
}

export interface SetKeyMessage extends BaseMessage {
  kind: 'setKey';
  payload: {
    participantId: string;
    key: CryptoKey | Uint8Array;
    keyIndex?: number;
  };
}

export interface EncodeMessage extends BaseMessage {
  kind: 'decode' | 'encode';
  payload: {
    participantId: string;
    readableStream: ReadableStream;
    writableStream: WritableStream;
  };
}

export type E2EEWorkerMessage = InitMessage | SetKeyMessage | EncodeMessage;

export type KeySet = { material: CryptoKey; cryptoKey: CryptoKey };
