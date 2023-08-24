import type Participant from '../room/participant/Participant';
import type { CryptorError } from './errors';
import type { KeyInfo } from './types';

export enum KeyProviderEvent {
  SetKey = 'setKey',
  RatchetRequest = 'ratchetRequest',
  KeyRatcheted = 'keyRatcheted',
}

export type KeyProviderCallbacks = {
  [KeyProviderEvent.SetKey]: (keyInfo: KeyInfo) => void;
  [KeyProviderEvent.RatchetRequest]: (participantIdentity?: string, keyIndex?: number) => void;
  [KeyProviderEvent.KeyRatcheted]: (material: CryptoKey, keyIndex?: number) => void;
};

export enum KeyHandlerEvent {
  KeyRatcheted = 'keyRatcheted',
}

export type ParticipantKeyHandlerCallbacks = {
  [KeyHandlerEvent.KeyRatcheted]: (
    material: CryptoKey,
    participantIdentity: string,
    keyIndex?: number,
  ) => void;
};

export enum EncryptionEvent {
  ParticipantEncryptionStatusChanged = 'participantEncryptionStatusChanged',
  EncryptionError = 'encryptionError',
}

export type E2EEManagerCallbacks = {
  [EncryptionEvent.ParticipantEncryptionStatusChanged]: (
    enabled: boolean,
    participant: Participant,
  ) => void;
  [EncryptionEvent.EncryptionError]: (error: Error) => void;
};

export type CryptorCallbacks = {
  [CryptorEvent.Error]: (error: CryptorError) => void;
};

export enum CryptorEvent {
  Error = 'cryptorError',
}
