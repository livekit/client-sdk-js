/**
 * Copyright 2023 LiveKit, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type Participant from '../room/participant/Participant';
import type { VideoCodec } from '../room/track/options';
import type { BaseKeyProvider } from './KeyProvider';
import type { CryptorError } from './errors';

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
    error: Error;
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
  failureTolerance: number;
};

export type KeyProviderCallbacks = {
  setKey: (keyInfo: KeyInfo) => void;
  ratchetRequest: (participantId?: string, keyIndex?: number) => void;
  /** currently only emitted for local participant */
  keyRatcheted: (material: CryptoKey, keyIndex?: number) => void;
};

export type ParticipantKeyHandlerCallbacks = {
  keyRatcheted: (material: CryptoKey, keyIndex?: number, participantId?: string) => void;
};

export type E2EEManagerCallbacks = {
  participantEncryptionStatusChanged: (enabled: boolean, participant?: Participant) => void;
  encryptionError: (error: Error) => void;
};

export const EncryptionEvent = {
  ParticipantEncryptionStatusChanged: 'participantEncryptionStatusChanged',
  Error: 'encryptionError',
} as const;

export type CryptorCallbacks = {
  cryptorError: (error: CryptorError) => void;
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

export type DecodeRatchetOptions = {
  /** attempts  */
  ratchetCount: number;
  /** ratcheted key to try */
  encryptionKey?: CryptoKey;
};
