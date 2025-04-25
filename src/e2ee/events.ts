import type Participant from '../room/participant/Participant';
import type { CryptorError } from './errors';
import type { KeyInfo } from './types';

export enum KeyProviderEvent {
  SetKey = 'setKey',
  /** Event for requesting to ratchet the key used to encrypt the stream */
  RatchetRequest = 'ratchetRequest',
  /** Emitted following a `RatchetRequest`, will contain the ratcheted key material */
  RatchetRequestCompleted = 'ratchetRequestCompleted',
  KeyRatcheted = 'keyRatcheted',
}

export type KeyProviderCallbacks = {
  [KeyProviderEvent.SetKey]: (keyInfo: KeyInfo) => void;
  [KeyProviderEvent.RatchetRequest]: (participantIdentity?: string, keyIndex?: number) => void;
  [KeyProviderEvent.RatchetRequestCompleted]: (material: ArrayBuffer, keyIndex?: number) => void;
  [KeyProviderEvent.KeyRatcheted]: (material: CryptoKey, keyIndex?: number) => void;
};

export enum KeyHandlerEvent {
  /** Emitted when a key has been ratcheted. Is emitted when any key has been ratcheted
   * i.e. when the FrameCryptor tried to ratchet when decryption is failing  */
  KeyRatcheted = 'keyRatcheted',
  /** Emitted when a ratchet request has been performed for the current user.
   * Will contain the ratcheted key material that can be sent out-of-band to new participants.
   * The ratcheted key material can be used with `createKeyMaterialFromBuffer` then with `KeyProvider#setKey`.*/
  RatchetRequestCompleted = 'ratchetRequestCompleted',
}

export type ParticipantKeyHandlerCallbacks = {
  [KeyHandlerEvent.KeyRatcheted]: (
    material: CryptoKey,
    participantIdentity: string,
    keyIndex?: number,
  ) => void;
  [KeyHandlerEvent.RatchetRequestCompleted]: (
    material: ArrayBuffer,
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
