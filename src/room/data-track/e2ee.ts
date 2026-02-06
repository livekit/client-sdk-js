export type EncryptedPayload = {
  payload: Uint8Array;
  iv: Uint8Array; // NOTE: should be 12 bytes long
  keyIndex: number;
};

export type EncryptionProvider = {
  // FIXME: add in explicit `Throws<..., EncryptionError>`?
  encrypt(payload: Uint8Array): EncryptedPayload;
};

export type DecryptionProvider = {
  decrypt(payload: Uint8Array, senderIdentity: string): Uint8Array;
};
