import { ENCRYPTION_ALGORITHM } from '../constants';
import type { ParticipantKeyHandler } from './ParticipantKeyHandler';

export class DataCryptor {
  private static sendCount = 0;

  private static makeIV(timestamp: number) {
    const iv = new ArrayBuffer(12);
    const ivView = new DataView(iv);
    const randomBytes = crypto.getRandomValues(new Uint32Array(1));
    ivView.setUint32(0, randomBytes[0]);
    ivView.setUint32(4, timestamp);
    ivView.setUint32(8, timestamp - (DataCryptor.sendCount % 0xffff));
    DataCryptor.sendCount++;

    return iv;
  }

  static async encrypt(
    data: Uint8Array,
    keys: ParticipantKeyHandler,
  ): Promise<{
    payload: Uint8Array;
    iv: Uint8Array;
    keyIndex: number;
  }> {
    const iv = DataCryptor.makeIV(performance.now());
    const keySet = await keys.getKeySet();
    if (!keySet) {
      throw new Error('No key set found');
    }

    const cipherText = await crypto.subtle.encrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv,
      },
      keySet.encryptionKey,
      new Uint8Array(data),
    );

    return {
      payload: new Uint8Array(cipherText),
      iv: new Uint8Array(iv),
      keyIndex: keys.getCurrentKeyIndex(),
    };
  }

  static async decrypt(
    data: Uint8Array,
    iv: Uint8Array,
    keys: ParticipantKeyHandler,
    keyIndex?: number,
  ): Promise<{
    payload: Uint8Array;
  }> {
    const keySet = await keys.getKeySet(keyIndex);
    if (!keySet) {
      throw new Error('No key set found');
    }

    const plainText = await crypto.subtle.decrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv,
      },
      keySet.encryptionKey,
      new Uint8Array(data),
    );
    return {
      payload: new Uint8Array(plainText),
    };
  }
}
